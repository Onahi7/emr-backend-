import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'qc_results' })
export class QcResult extends Document {
  @Prop({ type: Types.ObjectId, ref: 'QcSample', required: true })
  qcSampleId!: Types.ObjectId;

  @Prop({ required: true })
  value!: number;

  @Prop({ required: true })
  isInRange!: boolean;

  @Prop({ type: [String] })
  flags?: string[];

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  testedBy?: Types.ObjectId;

  @Prop({ required: true })
  testedAt!: Date;

  createdAt!: Date;
}

export const QcResultSchema = SchemaFactory.createForClass(QcResult);

// Indexes
QcResultSchema.index({ qcSampleId: 1 });
QcResultSchema.index({ isInRange: 1 });
