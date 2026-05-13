import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum DirectionEnum {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum CommunicationStatusEnum {
  PROCESSED = 'processed',
  ERROR = 'error',
}

@Schema({ timestamps: true, collection: 'communication_logs' })
export class CommunicationLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Machine' })
  machineId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(DirectionEnum) })
  direction: DirectionEnum;

  @Prop({ required: true })
  protocol: string;

  @Prop()
  messageType?: string;

  @Prop()
  messageControlId?: string;

  @Prop({ maxlength: 5000 })
  rawMessage?: string;

  @Prop({ type: Object })
  parsedSummary?: Record<string, any>;

  @Prop({
    required: true,
    enum: Object.values(CommunicationStatusEnum),
  })
  status: CommunicationStatusEnum;

  @Prop()
  errorMessage?: string;

  @Prop()
  resultsCount?: number;

  @Prop()
  processingTimeMs?: number;

  createdAt: Date;
}

export const CommunicationLogSchema =
  SchemaFactory.createForClass(CommunicationLog);

// Indexes
CommunicationLogSchema.index({ machineId: 1 });
CommunicationLogSchema.index({ status: 1 });
CommunicationLogSchema.index({ createdAt: -1 });
