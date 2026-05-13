import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum NotificationMethodEnum {
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
  PHONE = 'phone',
}

@Schema({ timestamps: true, collection: 'critical_result_notifications' })
export class CriticalResultNotification extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Result', required: true })
  resultId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  notifiedUserId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(NotificationMethodEnum) })
  notificationMethod!: NotificationMethodEnum;

  @Prop({ required: true })
  notifiedAt!: Date;

  @Prop()
  acknowledgedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  acknowledgedBy?: Types.ObjectId;

  createdAt!: Date;
}

export const CriticalResultNotificationSchema = SchemaFactory.createForClass(
  CriticalResultNotification,
);

// Indexes
CriticalResultNotificationSchema.index({ resultId: 1 });
