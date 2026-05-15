import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum QueueStatusEnum {
  WAITING = 'waiting',
  WITH_NURSE = 'with_nurse',
  WITH_DOCTOR = 'with_doctor',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PriorityLevelEnum {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ timestamps: true, collection: 'queue' })
export class Queue extends Document {
  @Prop({ required: true, unique: true })
  queueNumber: string; // Q-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  visitId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Consultation' })
  consultationId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(QueueStatusEnum) })
  status: QueueStatusEnum;

  @Prop({ required: true, enum: Object.values(PriorityLevelEnum) })
  priority: PriorityLevelEnum;

  @Prop({ default: 0 })
  queueOrder: number;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  nurseId?: Types.ObjectId;

  // The doctor (system user — Profile) assigned to this queue entry.
  // Set from req.user.userId when doctor accepts, or from nurse assignment.
  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  doctorId?: Types.ObjectId;

  @Prop()
  nurseCalledAt?: Date;

  @Prop()
  doctorCalledAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancellationReason?: string;

  @Prop()
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const QueueSchema = SchemaFactory.createForClass(Queue);

// Indexes
QueueSchema.index({ queueNumber: 1 }, { unique: true });
QueueSchema.index({ patientId: 1 });
QueueSchema.index({ status: 1 });
QueueSchema.index({ queueOrder: 1 });
QueueSchema.index({ createdAt: 1 });
QueueSchema.index({ visitId: 1 });
