import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReferenceGenderEnum {
  MALE = 'M',
  FEMALE = 'F',
  OTHER = 'O',
  ALL = 'all',
}

@Schema({ timestamps: true, collection: 'test_reference_ranges' })
export class TestReferenceRange extends Document {
  @Prop({ type: Types.ObjectId, ref: 'TestCatalog', required: true })
  testId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ReferenceGenderEnum) })
  gender: ReferenceGenderEnum;

  @Prop()
  ageMin?: number;

  @Prop()
  ageMax?: number;

  @Prop({ required: true })
  referenceRange: string;

  @Prop()
  unit?: string;

  createdAt: Date;
}

export const TestReferenceRangeSchema =
  SchemaFactory.createForClass(TestReferenceRange);

// Indexes
TestReferenceRangeSchema.index({ testId: 1 });
