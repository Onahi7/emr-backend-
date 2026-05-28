import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BranchDocument = Branch & Document;

@Schema({ timestamps: true })
export class Branch {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ default: '' })
  address!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  logoUrl!: string;

  // CAF integration
  @Prop()
  cafBranchId?: string;

  @Prop({ default: 'emr-integration' })
  cafTerminalId!: string;

  // LAB integration
  @Prop()
  labApiKey?: string;

  @Prop()
  labFacilityId?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);
