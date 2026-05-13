import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum QcLevelEnum {
  LEVEL_1 = 'level_1',
  LEVEL_2 = 'level_2',
  LEVEL_3 = 'level_3',
  NORMAL = 'normal',
  ABNORMAL = 'abnormal',
}

@Schema({ timestamps: true, collection: 'qc_samples' })
export class QcSample extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Machine' })
  machineId?: Types.ObjectId;

  @Prop({ required: true })
  testCode!: string;

  @Prop()
  lotNumber?: string;

  @Prop({ required: true, enum: Object.values(QcLevelEnum) })
  level!: QcLevelEnum;

  @Prop()
  expiryDate?: Date;

  @Prop()
  targetValue?: number;

  @Prop()
  targetSd?: number;

  createdAt!: Date;
}

export const QcSampleSchema = SchemaFactory.createForClass(QcSample);
