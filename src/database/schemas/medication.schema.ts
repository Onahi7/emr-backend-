import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

/**
 * Pack / sell unit of a medication.
 * Mirrors the CAF product `packSizes` shape.
 * Example: { name: "Box of 30", unit: "box", unitsPerPack: 30, sellingPrice: 150 }
 * A medication can have multiple pack variants (box of 30, strip of 10, etc).
 */
@Schema({ _id: false })
export class PackSize {
  @Prop({ required: true })
  name: string; // "Box of 30", "Strip of 10", "100ml bottle"

  @Prop({ required: true })
  unit: string; // "box", "strip", "bottle", "vial"

  @Prop({ required: true })
  unitsPerPack: number; // 30, 10, 1

  @Prop({ required: true })
  sellingPrice: number; // per-pack price in Leones

  @Prop()
  barcode?: string;

  @Prop({ default: false })
  isDefault?: boolean;
}
export const PackSizeSchema = SchemaFactory.createForClass(PackSize);

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

  /** Stock is always stored in baseUnits (tablets, ml, ampules) */
  @Prop({ default: 0 })
  stockQuantity: number;

  /** Smallest indivisible unit — "tablet", "capsule", "ml", "ampule", "drop" */
  @Prop({ default: 'tablet' })
  baseUnit: string;

  /**
   * How the medication is sold. Receptionist toggles between these at dispense.
   * - "individual": dispensed one base unit at a time (1 ampule, 1 tablet)
   * - "pack": dispensed in pre-defined pack sizes (1 box of 30)
   * - "both": the receptionist can choose at dispense time
   */
  @Prop({ enum: ['individual', 'pack', 'both'], default: 'both' })
  sellMode: 'individual' | 'pack' | 'both';

  /** Available pack variants (Box of 30, Strip of 10, etc.) */
  @Prop({ type: [PackSizeSchema], default: [] })
  packSizes: PackSize[];

  /** Per-base-unit price in Leones. Used when sellMode is "individual". */
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

  /** Set to true if this medication is sourced from CAF (no local stock) */
  @Prop({ default: false })
  isCafSourced?: boolean;

  /** CAF's own product _id, if this is a CAF mirror */
  @Prop()
  cafProductId?: string;

  /** Last time we synced this from CAF (for refresh logic) */
  @Prop()
  cafSyncedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const MedicationSchema = SchemaFactory.createForClass(Medication);

// Indexes
MedicationSchema.index({ medicationCode: 1 }, { unique: true });
MedicationSchema.index({ name: 'text', genericName: 'text' });
MedicationSchema.index({ category: 1 });
MedicationSchema.index({ stockQuantity: 1 });
MedicationSchema.index({ isCafSourced: 1, cafProductId: 1 });

