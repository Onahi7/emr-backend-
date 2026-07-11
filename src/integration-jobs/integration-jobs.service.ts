import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IntegrationJob,
  IntegrationJobStatus,
  IntegrationJobType,
} from '../database/schemas/integration-job.schema';
import { requireBranchId } from '../common/utils/branch-scope';

@Injectable()
export class IntegrationJobsService {
  constructor(@InjectModel(IntegrationJob.name) private readonly jobModel: Model<IntegrationJob>) {}

  async enqueue(input: {
    branchId: string | Types.ObjectId;
    type: IntegrationJobType;
    aggregateId: string;
    idempotencyKey: string;
    payload?: Record<string, any>;
    maxAttempts?: number;
  }): Promise<IntegrationJob> {
    const branchId = new Types.ObjectId(requireBranchId(input.branchId));
    return this.jobModel.findOneAndUpdate(
      { idempotencyKey: input.idempotencyKey },
      {
        $setOnInsert: {
          branchId,
          type: input.type,
          aggregateId: input.aggregateId,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload || {},
          status: IntegrationJobStatus.PENDING,
          attempts: 0,
          maxAttempts: input.maxAttempts || 8,
          nextAttemptAt: new Date(),
        },
      },
      { upsert: true, new: true },
    ).exec();
  }

  async start(id: string): Promise<IntegrationJob> {
    const job = await this.jobModel.findByIdAndUpdate(
      id,
      {
        $set: { status: IntegrationJobStatus.PROCESSING, lastAttemptAt: new Date() },
        $inc: { attempts: 1 },
        $unset: { lastError: '' },
      },
      { new: true },
    ).exec();
    if (!job) throw new NotFoundException('Integration job not found');
    return job;
  }

  async complete(id: string, result?: Record<string, any>): Promise<IntegrationJob> {
    const job = await this.jobModel.findByIdAndUpdate(
      id,
      { status: IntegrationJobStatus.COMPLETED, completedAt: new Date(), result: result || {} },
      { new: true },
    ).exec();
    if (!job) throw new NotFoundException('Integration job not found');
    return job;
  }

  async fail(id: string, error: unknown): Promise<IntegrationJob> {
    const current = await this.jobModel.findById(id).exec();
    if (!current) throw new NotFoundException('Integration job not found');
    const terminal = current.attempts >= current.maxAttempts;
    const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, current.attempts - 1)));
    current.status = terminal ? IntegrationJobStatus.FAILED : IntegrationJobStatus.PENDING;
    current.lastError = error instanceof Error ? error.message : String(error);
    current.nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000);
    return current.save();
  }

  async list(branchId?: string, status?: IntegrationJobStatus, limit = 100): Promise<IntegrationJob[]> {
    const query: Record<string, any> = {};
    if (branchId) query.branchId = new Types.ObjectId(requireBranchId(branchId));
    if (status) query.status = status;
    return this.jobModel.find(query).sort({ createdAt: -1 }).limit(Math.min(250, Math.max(1, limit))).lean().exec() as any;
  }

  async retry(id: string, branchId?: string): Promise<IntegrationJob> {
    const query: Record<string, any> = { _id: new Types.ObjectId(id) };
    if (branchId) query.branchId = new Types.ObjectId(requireBranchId(branchId));
    const job = await this.jobModel.findOneAndUpdate(
      query,
      { status: IntegrationJobStatus.PENDING, nextAttemptAt: new Date(), $unset: { lastError: '' } },
      { new: true },
    ).exec();
    if (!job) throw new NotFoundException('Integration job not found');
    return job;
  }

  async getByKey(idempotencyKey: string): Promise<IntegrationJob | null> {
    return this.jobModel.findOne({ idempotencyKey }).exec();
  }

  async findReady(types: IntegrationJobType[], limit = 20): Promise<IntegrationJob[]> {
    return this.jobModel.find({
      type: { $in: types },
      status: IntegrationJobStatus.PENDING,
      nextAttemptAt: { $lte: new Date() },
      $expr: { $lt: ['$attempts', '$maxAttempts'] },
    }).sort({ nextAttemptAt: 1, createdAt: 1 }).limit(limit).exec();
  }
}
