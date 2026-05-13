import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum AuditActionEnum {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  userId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(AuditActionEnum) })
  action: AuditActionEnum;

  @Prop({ required: true })
  tableName: string;

  @Prop({ required: true })
  recordId: string;

  @Prop({ type: Object })
  oldData?: Record<string, any>;

  @Prop({ type: Object })
  newData?: Record<string, any>;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ tableName: 1 });
AuditLogSchema.index({ createdAt: -1 });
