import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ServicePriceCodeEnum {
  NORMAL_CONSULTATION = 'normal_consultation',
  SPECIALIST_CONSULTATION = 'specialist_consultation',
  OBSERVATION_4H = 'observation_4h',
  PROCEDURE = 'procedure',
  RAPID_MALARIA = 'rapid_malaria',
  RAPID_TYPHOID = 'rapid_typhoid',
  OXYGEN_HOUR = 'oxygen_hour',
}

export type ServicePriceDocument = ServicePrice & Document;

@Schema({ timestamps: true, collection: 'service_prices' })
export class ServicePrice {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  code!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  category!: string;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: false })
  isCustom!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const ServicePriceSchema = SchemaFactory.createForClass(ServicePrice);
ServicePriceSchema.index({ branchId: 1, code: 1 }, { unique: true });
