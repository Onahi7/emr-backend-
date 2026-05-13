import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum MedicationCategoryEnum {
  ANALGESIC = 'analgesic',
  ANTIBIOTIC = 'antibiotic',
  ANTIVIRAL = 'antiviral',
  ANTIHISTAMINE = 'antihistamine',
  ANTIHYPERTENSIVE = 'antihypertensive',
  ANTIDIABETIC = 'antidiabetic',
  ANTACID = 'antacid',
  ANTIDEPRESSANT = 'antidepressant',
  VITAMIN = 'vitamin',
  SUPPLEMENT = 'supplement',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'medications' })
export class Medication extends Document {
  @Prop({ required: true, unique: true })
  medicationCode: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  genericName: string;

  @Prop({ enum: Object.values(MedicationCategoryEnum) })
  category?: MedicationCategoryEnum;

  @Prop()
  description?: string;

  @Prop()
  dosageForm?: string; // tablet, capsule, syrup, injection, etc.

  @Prop()
  strength?: string; // 500mg, 250mg/5ml, etc.

  @Prop()
  manufacturer?: string;

  @Prop({ default: 0 })
  stockQuantity: number;

  @Prop()
  unit?: string; // pieces, bottles, vials, etc.

  @Prop({ default: 0 })
  unitPrice: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 10 })
  reorderLevel: number;

  @Prop()
  batchNumber?: string;

  @Prop()
  expiryDate?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const MedicationSchema = SchemaFactory.createForClass(Medication);

// Indexes
MedicationSchema.index({ medicationCode: 1 }, { unique: true });
MedicationSchema.index({ name: 'text', genericName: 'text' });
MedicationSchema.index({ category: 1 });
MedicationSchema.index({ stockQuantity: 1 });
