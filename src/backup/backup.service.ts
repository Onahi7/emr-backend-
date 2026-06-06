import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from '../database/schemas/audit-log.schema';

export interface BackupFile {
  id: string;
  filename: string;
  path: string;
  size: number;
  createdAt: string;
  triggeredBy: 'cron' | 'manual';
  actorEmail?: string;
  collections: number;
  documents: number;
  durationMs: number;
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private isRunning = false;
  private lastBackupAt: Date | null = null;

  constructor(
    @InjectConnection() private connection: Connection,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLog>,
  ) {
    this.backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  }

  async onModuleInit() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    this.logger.log(`Backup directory: ${this.backupDir}`);
  }

  @Cron(process.env.BACKUP_CRON || '0 2 * * *', {
    name: 'daily-database-backup',
    timeZone: 'UTC',
  })
  async scheduledBackup() {
    if (this.isRunning) {
      this.logger.warn('Backup already in progress, skipping scheduled run');
      return;
    }
    try {
      const result = await this.runBackup('cron');
      this.logger.log(
        `Scheduled backup complete: ${result.filename} (${result.documents} docs, ${(result.size / 1024).toFixed(1)} KB)`,
      );
    } catch (error: any) {
      this.logger.error(`Scheduled backup failed: ${error?.message || error}`);
      await this.logAudit('BACKUP_FAILED', 'cron', null, error?.message);
    }
  }

  async runBackup(triggeredBy: 'cron' | 'manual', actorEmail?: string): Promise<BackupFile> {
    if (this.isRunning) {
      throw new Error('A backup is already in progress');
    }
    this.isRunning = true;
    const startTime = Date.now();

    const now = new Date();
    const id = this.formatTimestamp(now);
    const filename = `backup-${id}.tar.gz`;
    const targetPath = path.join(this.backupDir, filename);

    const collectionStats: Record<string, number> = {};
    let totalDocuments = 0;

    try {
      const db = this.connection.db;
      if (!db) {
        throw new Error('Database connection not ready');
      }

      const collections = await db.listCollections().toArray();
      const dump: Record<string, any[]> = {};
      for (const col of collections) {
        if (col.name.startsWith('system.')) continue;
        const docs = await db.collection(col.name).find({}).toArray();
        dump[col.name] = docs;
        collectionStats[col.name] = docs.length;
        totalDocuments += docs.length;
      }

      const manifest = {
        id,
        createdAt: now.toISOString(),
        triggeredBy,
        actorEmail: actorEmail || null,
        mongoUri: this.maskUri(process.env.MONGODB_URI || ''),
        database: this.connection.name,
        collectionStats,
        totalDocuments,
        tool: 'harbour-emr-backup@1.0',
      };

      const filesToArchive: { name: string; data: Buffer }[] = [
        { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
      ];
      for (const [name, docs] of Object.entries(dump)) {
        filesToArchive.push({
          name: `${name}.json`,
          data: Buffer.from(JSON.stringify(docs, null, 2)),
        });
      }

      const tarGz = this.createTarGz(filesToArchive);
      fs.writeFileSync(targetPath, tarGz);

      const stats = fs.statSync(targetPath);
      const durationMs = Date.now() - startTime;
      this.lastBackupAt = now;
      this.rotateOldBackups(parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10));

      const backup: BackupFile = {
        id,
        filename,
        path: targetPath,
        size: stats.size,
        createdAt: now.toISOString(),
        triggeredBy,
        actorEmail,
        collections: Object.keys(collectionStats).length,
        documents: totalDocuments,
        durationMs,
      };
      await this.logAudit('BACKUP_SUCCESS', triggeredBy, actorEmail, null, backup);
      return backup;
    } catch (error: any) {
      await this.logAudit('BACKUP_FAILED', triggeredBy, actorEmail, error?.message);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  listBackups(): BackupFile[] {
    if (!fs.existsSync(this.backupDir)) return [];
    const files = fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.tar.gz'));
    return files
      .map((filename) => {
        const fullPath = path.join(this.backupDir, filename);
        const stats = fs.statSync(fullPath);
        const id = filename.replace(/^backup-/, '').replace(/\.tar\.gz$/, '');
        return {
          id,
          filename,
          path: fullPath,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          triggeredBy: 'cron' as const,
          collections: 0,
          documents: 0,
          durationMs: 0,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBackup(id: string): BackupFile | null {
    const list = this.listBackups();
    return list.find((b) => b.id === id) || null;
  }

  getBackupPath(id: string): string | null {
    const list = this.listBackups();
    const backup = list.find((b) => b.id === id);
    return backup ? backup.path : null;
  }

  deleteBackup(id: string): boolean {
    const backup = this.getBackup(id);
    if (!backup) return false;
    try {
      fs.unlinkSync(backup.path);
      this.logger.log(`Deleted backup ${id}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to delete backup ${id}: ${error?.message}`);
      return false;
    }
  }

  getStatus(): { lastBackupAt: string | null; nextScheduledAt: string; totalBackups: number; totalSizeBytes: number; isRunning: boolean; backupDir: string } {
    const list = this.listBackups();
    const totalSize = list.reduce((sum, b) => sum + b.size, 0);
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return {
      lastBackupAt: this.lastBackupAt ? this.lastBackupAt.toISOString() : (list[0]?.createdAt || null),
      nextScheduledAt: next.toISOString(),
      totalBackups: list.length,
      totalSizeBytes: totalSize,
      isRunning: this.isRunning,
      backupDir: this.backupDir,
    };
  }

  private rotateOldBackups(retentionDays: number) {
    if (retentionDays <= 0) return;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const list = this.listBackups();
    for (const b of list) {
      const t = new Date(b.createdAt).getTime();
      if (t < cutoff) {
        try {
          fs.unlinkSync(b.path);
          this.logger.log(`Rotated out old backup ${b.id} (${b.filename})`);
        } catch (error: any) {
          this.logger.error(`Failed to rotate backup ${b.id}: ${error?.message}`);
        }
      }
    }
  }

  private formatTimestamp(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  }

  private maskUri(uri: string): string {
    try {
      return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/, '$1$2:***@');
    } catch {
      return 'redacted';
    }
  }

  private createTarGz(files: { name: string; data: Buffer }[]): Buffer {
    const blocks: Buffer[] = [];
    for (const file of files) {
      const nameBuf = Buffer.from(file.name, 'utf8');
      const nameBufPadded = Buffer.alloc(100);
      nameBuf.copy(nameBufPadded, 0, 0, Math.min(nameBuf.length, 100));
      const sizeOct = file.data.length.toString(8).padStart(11, '0') + ' ';
      const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(12, '0');
      const header = Buffer.alloc(512);
      nameBufPadded.copy(header, 0);
      Buffer.from('0000644 ').copy(header, 100);
      Buffer.from('0001750 ').copy(header, 108);
      Buffer.from('0001750 ').copy(header, 116);
      Buffer.from(sizeOct).copy(header, 124);
      Buffer.from(mtime).copy(header, 136);
      for (let i = 148; i < 156; i++) header[i] = 0x20;
      header[156] = '0'.charCodeAt(0);
      Buffer.from('ustar').copy(header, 257);
      header[262] = 0;
      header[263] = '0'.charCodeAt(0);
      header[264] = '0'.charCodeAt(0);
      Buffer.from('emrbackup').copy(header, 265, 0, Math.min(9, 'emrbackup'.length));
      const checksum = header.reduce((sum, b) => sum + b, 0);
      const checksumOct = checksum.toString(8).padStart(6, '0') + '\0 ';
      Buffer.from(checksumOct).copy(header, 148);
      blocks.push(header);
      blocks.push(file.data);
      const remainder = file.data.length % 512;
      if (remainder !== 0) {
        blocks.push(Buffer.alloc(512 - remainder));
      }
    }
    blocks.push(Buffer.alloc(1024));
    const tar = Buffer.concat(blocks);
    return zlib.gzipSync(tar, { level: 6 });
  }

  private async logAudit(
    action: 'BACKUP_SUCCESS' | 'BACKUP_FAILED',
    triggeredBy: 'cron' | 'manual',
    actorEmail: string | null,
    error: string | null,
    backup?: BackupFile,
  ) {
    try {
      const payload: any = {
        action: action === 'BACKUP_SUCCESS' ? 'INSERT' : 'UPDATE',
        tableName: 'system_backup',
        recordId: backup ? `backup-${backup.id}` : `backup-${Date.now()}`,
        userId: null,
      };
      payload.newData = {
        outcome: action,
        triggeredBy,
        actorEmail,
        error: error || undefined,
        ...(backup
          ? {
              id: backup.id,
              filename: backup.filename,
              size: backup.size,
              collections: backup.collections,
              documents: backup.documents,
              durationMs: backup.durationMs,
            }
          : {}),
      };
      await this.auditLogModel.create(payload);
    } catch (err: any) {
      this.logger.error(`Failed to write audit log: ${err?.message}`);
    }
  }
}
