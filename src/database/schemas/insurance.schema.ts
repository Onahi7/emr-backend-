import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'insurance-programs' })
export class InsuranceProgram extends Document {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  contactPerson?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true })
  contactEmail?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  paymentTerms?: string;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const InsuranceProgramSchema = SchemaFactory.createForClass(InsuranceProgram);
InsuranceProgramSchema.index({ code: 1 }, { unique: true });
export type InsuranceProgramDocument = InsuranceProgram & Document;

@Schema({ timestamps: true, collection: 'insurance-sub-entities' })
export class InsuranceSubEntity extends Document {
  @Prop({ type: Types.ObjectId, ref: 'InsuranceProgram', required: true, index: true })
  programId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  contactPerson?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const InsuranceSubEntitySchema = SchemaFactory.createForClass(InsuranceSubEntity);
InsuranceSubEntitySchema.index({ programId: 1, code: 1 }, { unique: true });
export type InsuranceSubEntityDocument = InsuranceSubEntity & Document;
