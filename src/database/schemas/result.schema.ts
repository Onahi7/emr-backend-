import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ResultFlagEnum {
  NORMAL = 'normal',
  LOW = 'low',
  HIGH = 'high',
  CRITICAL_LOW = 'critical_low',
  CRITICAL_HIGH = 'critical_high',
}

export enum ResultStatusEnum {
  PRELIMINARY = 'preliminary',
  VERIFIED = 'verified',
  AMENDED = 'amended',
}

@Schema({ timestamps: true, collection: 'results' })
export class Result extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OrderTest' })
  orderTestId?: Types.ObjectId;

  @Prop({ required: true })
  testCode: string;

  @Prop({ required: true })
  testName: string;

  @Prop()
  panelCode?: string;

  @Prop()
  panelName?: string;

  @Prop()
  category?: string;

  @Prop()
  subcategory?: string; // For organizing tests within a panel (e.g., urinalysis: Physical, Dipstick, Microscopic)

  @Prop({ required: true })
  value: string;

  @Prop()
  unit?: string;

  @Prop()
  referenceRange?: string;

  @Prop()
  menstrualPhase?: string; // For hormone tests: 'follicular', 'ovulation', 'luteal', 'menopause', 'pregnancy'

  @Prop()
  allReferenceRanges?: string; // JSON string containing all applicable ranges for display

  @Prop({
    required: true,
    enum: Object.values(ResultFlagEnum),
  })
  flag: ResultFlagEnum;

  @Prop({
    required: true,
    enum: Object.values(ResultStatusEnum),
    default: ResultStatusEnum.PRELIMINARY,
  })
  status: ResultStatusEnum;

  @Prop()
  comments?: string;

  @Prop({ required: true })
  resultedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  resultedBy?: Types.ObjectId;

  @Prop()
  verifiedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  verifiedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Result' })
  amendedFrom?: Types.ObjectId;

  @Prop()
  amendmentReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ResultSchema = SchemaFactory.createForClass(Result);

// Indexes
ResultSchema.index({ orderId: 1 });
ResultSchema.index({ testCode: 1 });
ResultSchema.index({ status: 1 });
ResultSchema.index({ flag: 1 });
// Unique compound index to prevent duplicate results for the same test in an order
ResultSchema.index({ orderId: 1, testCode: 1 }, { unique: true });
