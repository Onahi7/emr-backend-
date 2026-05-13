import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SampleTypeEnum {
  BLOOD = 'blood',
  URINE = 'urine',
  STOOL = 'stool',
  SWAB = 'swab',
  OTHER = 'other',
}

export enum SampleStatusEnum {
  COLLECTED = 'collected',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'samples' })
export class Sample extends Document {
  @Prop({ required: true, unique: true })
  sampleId: string; // SMP-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(SampleTypeEnum) })
  sampleType: SampleTypeEnum;

  @Prop({ required: true, enum: Object.values(SampleStatusEnum) })
  status: SampleStatusEnum;

  @Prop({ required: true })
  collectedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  collectedBy?: Types.ObjectId;

  @Prop()
  rejectionReason?: string;

  @Prop()
  rejectedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  rejectedBy?: Types.ObjectId;

  createdAt: Date;
}

export const SampleSchema = SchemaFactory.createForClass(Sample);

// Indexes
SampleSchema.index({ sampleId: 1 }, { unique: true });
SampleSchema.index({ orderId: 1 });
SampleSchema.index({ status: 1 });
