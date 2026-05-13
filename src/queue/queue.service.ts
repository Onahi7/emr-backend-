import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue, QueueStatusEnum, PriorityLevelEnum } from '../database/schemas/queue.schema';
import { CreateQueueDto } from './dto/create-queue.dto';
import { Patient } from '../database/schemas/patient.schema';
import { Consultation } from '../database/schemas/consultation.schema';

@Injectable()
export class QueueService {
  constructor(
    @InjectModel(Queue.name) private queueModel: Model<Queue>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
  ) {}

  async addToQueue(createQueueDto: CreateQueueDto): Promise<Queue> {
    const { patientId, visitId, consultationId, priority, notes } = createQueueDto;

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Generate queue number
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const count = await this.queueModel.countDocuments({
      createdAt: {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    });
    const queueNumber = `Q-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    // Get the last queue order
    const lastQueue = await this.queueModel.findOne().sort({ queueOrder: -1 }).exec();
    const queueOrder = lastQueue ? lastQueue.queueOrder + 1 : 1;

    const queueEntry = new this.queueModel({
      queueNumber,
      patientId: new Types.ObjectId(patientId),
      visitId: visitId ? new Types.ObjectId(visitId) : undefined,
      consultationId: consultationId ? new Types.ObjectId(consultationId) : undefined,
      status: QueueStatusEnum.WAITING,
      priority: priority || PriorityLevelEnum.NORMAL,
      queueOrder,
      notes,
    });

    return queueEntry.save();
  }

  async getQueue(status?: QueueStatusEnum): Promise<Queue[]> {
    const query = status ? { status } : { status: { $ne: QueueStatusEnum.COMPLETED } };
    return this.queueModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName')
      .populate('consultationId')
      .sort({ priority: 1, queueOrder: 1 })
      .exec();
  }

  async findById(id: string): Promise<Queue> {
    const queueEntry = await this.queueModel
      .findById(id)
      .populate('patientId')
      .populate('consultationId')
      .exec();
    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }
    return queueEntry;
  }

  async updateStatus(id: string, status: QueueStatusEnum, userId?: string): Promise<Queue> {
    const queueEntry = await this.queueModel.findById(id);
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

  async removeFromQueue(id: string, reason: string, cancelledBy: string): Promise<Queue> {
    const queueEntry = await this.queueModel.findById(id);
    if (!queueEntry) {
      throw new NotFoundException('Queue entry not found');
    }
    queueEntry.status = QueueStatusEnum.CANCELLED;
    queueEntry.cancelledAt = new Date();
    queueEntry.cancelledBy = new Types.ObjectId(cancelledBy);
    queueEntry.cancellationReason = reason;
    return queueEntry.save();
  }

  async reorderQueue(queueIds: string[]): Promise<void> {
    for (let i = 0; i < queueIds.length; i++) {
      await this.queueModel.findByIdAndUpdate(queueIds[i], { queueOrder: i + 1 });
    }
  }
}
