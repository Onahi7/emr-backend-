import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum IntegrationJobType {
  LIS_ORDER_SYNC = 'lis_order_sync',
  LIS_PAYMENT_SYNC = 'lis_payment_sync',
  LIS_RESULT_IMPORT = 'lis_result_import',
  CAF_CHECKOUT = 'caf_checkout',
}

export enum IntegrationJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: true, collection: 'integration_jobs' })
export class IntegrationJob extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(IntegrationJobType), index: true })
  type: IntegrationJobType;

  @Prop({ required: true, index: true })
  aggregateId: string;

  @Prop({ required: true, unique: true, index: true })
  idempotencyKey: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, any>;

  @Prop({ required: true, enum: Object.values(IntegrationJobStatus), default: IntegrationJobStatus.PENDING, index: true })
  status: IntegrationJobStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 8 })
  maxAttempts: number;

  @Prop({ default: () => new Date(), index: true })
  nextAttemptAt: Date;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  lastError?: string;

  @Prop({ type: Object })
  result?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

export const IntegrationJobSchema = SchemaFactory.createForClass(IntegrationJob);
IntegrationJobSchema.index({ status: 1, nextAttemptAt: 1 });
IntegrationJobSchema.index({ branchId: 1, type: 1, createdAt: -1 });
