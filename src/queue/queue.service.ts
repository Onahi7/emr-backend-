import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue, QueueStatusEnum, PriorityLevelEnum } from '../database/schemas/queue.schema';
import { CreateQueueDto } from './dto/create-queue.dto';
import { Patient } from '../database/schemas/patient.schema';
import { Consultation } from '../database/schemas/consultation.schema';
import { branchFilter, requireBranchId, withBranch } from '../common/utils/branch-scope';

@Injectable()
export class QueueService {
  constructor(
    @InjectModel(Queue.name) private queueModel: Model<Queue>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
  ) {}

  async addToQueue(createQueueDto: CreateQueueDto, branchId?: string): Promise<Queue> {
    const requiredBranchId = requireBranchId(branchId);
    const { patientId, visitId, consultationId, priority, notes } = createQueueDto;

    // Verify patient exists
    const patient = await this.patientModel.findOne(withBranch({ _id: patientId }, requiredBranchId));
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Generate queue number
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const countQuery: any = {
      createdAt: {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    };
    countQuery.branchId = requiredBranchId;
    const count = await this.queueModel.countDocuments(countQuery);
    const queueNumber = `Q-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    // Get the last queue order
    const lastQueueQuery: any = branchFilter(requiredBranchId);
    const lastQueue = await this.queueModel.findOne(lastQueueQuery).sort({ queueOrder: -1 }).exec();
    const queueOrder = lastQueue ? lastQueue.queueOrder + 1 : 1;

    const queueData: any = {
      queueNumber,
      patientId: new Types.ObjectId(patientId),
      visitId: visitId ? new Types.ObjectId(visitId) : undefined,
      consultationId: consultationId ? new Types.ObjectId(consultationId) : undefined,
      status: QueueStatusEnum.WAITING,
      priority: priority || PriorityLevelEnum.NORMAL,
      queueOrder,
      notes,
    };
    queueData.branchId = requiredBranchId;

    const queueEntry = new this.queueModel(queueData);

    return queueEntry.save();
  }

  async getQueue(status?: QueueStatusEnum, branchId?: string): Promise<Queue[]> {
    const query: any = withBranch(status ? { status } : { status: { $ne: QueueStatusEnum.COMPLETED } }, branchId);

    return this.queueModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName')
      .populate('consultationId')
      .sort({ priority: 1, queueOrder: 1 })
      .exec();
  }

  async findById(id: string, branchId?: string): Promise<Queue> {
    const query: any = withBranch({ _id: id }, branchId);

    const queueEntry = await this.queueModel
      .findOne(query)
      .populate('patientId')
      .populate('consultationId')
      .exec();
    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }
    return queueEntry;
  }

  async updateStatus(id: string, status: QueueStatusEnum, userId?: string, branchId?: string): Promise<Queue> {
    const query: any = withBranch({ _id: id }, branchId);

    const queueEntry = await this.queueModel.findOne(query);
    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }

    queueEntry.status = status;

    if (status === QueueStatusEnum.WITH_NURSE && !queueEntry.nurseCalledAt) {
      queueEntry.nurseCalledAt = new Date();
    }

    if (status === QueueStatusEnum.WITH_DOCTOR && !queueEntry.doctorCalledAt) {
      queueEntry.doctorCalledAt = new Date();
    }

    if (status === QueueStatusEnum.COMPLETED && !queueEntry.completedAt) {
      queueEntry.completedAt = new Date();
    }

    return queueEntry.save();
  }

  async removeFromQueue(id: string, reason: string, cancelledBy: string, branchId?: string): Promise<Queue> {
    const query: any = withBranch({ _id: id }, branchId);

    const queueEntry = await this.queueModel.findOne(query);
    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }
    queueEntry.status = QueueStatusEnum.CANCELLED;
    queueEntry.cancelledAt = new Date();
    queueEntry.cancelledBy = new Types.ObjectId(cancelledBy);
    queueEntry.cancellationReason = reason;
    return queueEntry.save();
  }

  async reorderQueue(queueIds: string[], branchId?: string): Promise<void> {
    for (let i = 0; i < queueIds.length; i++) {
      const query: any = withBranch({ _id: queueIds[i] }, branchId);
      await this.queueModel.findOneAndUpdate(query, { queueOrder: i + 1 });
    }
  }
}
