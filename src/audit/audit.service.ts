import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog } from '../database/schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private auditLogModel: Model<AuditLog>,
  ) {}

  /**
   * Create audit log entry
   */
  async createAuditLog(data: {
    userId: string;
    action: string;
    tableName: string;
    recordId: string;
    oldData?: any;
    newData?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    const auditLog = new this.auditLogModel({
      userId: new Types.ObjectId(data.userId),
      action: data.action,
      tableName: data.tableName,
      recordId: data.recordId,
      oldData: data.oldData,
      newData: data.newData,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    return auditLog.save();
  }

  /**
   * Get all audit logs with filters
   */
  async findAll(filters: {
    userId?: string;
    tableName?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const query: any = {};

    if (filters.userId) {
      query.userId = new Types.ObjectId(filters.userId);
    }
    if (filters.tableName) {
      query.tableName = filters.tableName;
    }
    if (filters.action) {
      query.action = filters.action;
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .populate('userId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(query),
    ]);

    return { logs, total };
  }

  /**
   * Get audit log by ID
   */
  async findById(id: string): Promise<AuditLog> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid audit log ID');
    }

    const log = await this.auditLogModel
      .findById(id)
      .populate('userId', 'fullName email')
      .exec();

    if (!log) {
      throw new NotFoundException('Audit log not found');
    }

    return log;
  }

  /**
   * Get audit logs by user ID
   */
  async findByUserId(
    userId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    return this.findAll({ userId, page, limit });
  }

  /**
   * Get audit logs by table name
   */
  async findByTableName(
    tableName: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    return this.findAll({ tableName, page, limit });
  }

  /**
   * Get audit logs by record ID
   */
  async findByRecordId(
    recordId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const query = { recordId };
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .populate('userId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(query),
    ]);

    return { logs, total };
  }
}
