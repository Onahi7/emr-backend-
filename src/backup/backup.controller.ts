import { Controller, Get, Param, Post, Delete, Res, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('admin/backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoleEnum.ADMIN)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /**
   * GET /admin/backup/status
   * Status: last backup time, next scheduled run, total backups, total size, current state
   */
  @Get('status')
  getStatus() {
    return this.backupService.getStatus();
  }

  /**
   * GET /admin/backup/list
   * List all available backups
   */
  @Get('list')
  list() {
    return { backups: this.backupService.listBackups() };
  }

  /**
   * POST /admin/backup/trigger
   * Manually trigger a backup; returns the metadata
   */
  @Post('trigger')
  async trigger(@Request() req: any) {
    const actorEmail = req.user?.email;
    const backup = await this.backupService.runBackup('manual', actorEmail);
    return backup;
  }

  /**
   * GET /admin/backup/:id/download
   * Download a specific backup file
   */
  @Get(':id/download')
  download(@Param('id') id: string, @Res() res: Response) {
    const filePath = this.backupService.getBackupPath(id);
    if (!filePath) {
      return res.status(404).json({ message: 'Backup not found' });
    }
    return res.download(filePath, `backup-${id}.tar.gz`);
  }

  /**
   * DELETE /admin/backup/:id
   * Delete a specific backup
   */
  @Delete(':id')
  delete(@Param('id') id: string) {
    const ok = this.backupService.deleteBackup(id);
    if (!ok) {
      return { success: false, message: 'Backup not found' };
    }
    return { success: true };
  }
}
