import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SampleTypeEnum } from './sample.schema';

export enum TestCategoryEnum {
  HEMATOLOGY = 'hematology',
  CHEMISTRY = 'chemistry',
  IMMUNOASSAY = 'immunoassay',
  SEROLOGY = 'serology',
  URINALYSIS = 'urinalysis',
  MICROBIOLOGY = 'microbiology',
  OTHER = 'other',
}

export interface ReferenceRangeItem {
  ageGroup?: string; // e.g., "Adult (18-65 years)", "Newborn", "Child (2-6 years)"
  ageMin?: number; // Minimum age in years
  ageMax?: number; // Maximum age in years
  gender?: 'M' | 'F' | 'all'; // Male, Female, or all
  pregnancy?: boolean; // Special range for pregnancy
  condition?: string; // e.g., "Follicular", "Luteal", "Postmenopause"
  range: string; // The actual reference range
  unit?: string; // Unit for this specific range
  criticalLow?: string; // Critical low value
  criticalHigh?: string; // Critical high value
}

@Schema({ timestamps: true, collection: 'test_catalog' })
export class TestCatalog extends Document {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: Object.values(TestCategoryEnum) })
  category: TestCategoryEnum;

  @Prop({ required: true, enum: Object.values(SampleTypeEnum) })
  sampleType: string;

  @Prop({ required: true })
  price: number;

  @Prop()
  unit?: string;

  @Prop()
  referenceRange?: string; // Legacy simple reference range

  @Prop({ type: [Object] })
  referenceRanges?: ReferenceRangeItem[]; // New comprehensive age/gender-specific ranges

  @Prop()
  turnaroundTime?: number;

  @Prop({ type: Types.ObjectId, ref: 'Machine' })
  machineId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  description?: string;

  @Prop()
  panelCode?: string;

  @Prop()
  panelName?: string;

  @Prop()
  subcategory?: string; // For organizing tests within a panel (e.g., urinalysis: Physical, Dipstick, Microscopic)

  @Prop({ type: [String] })
  linkedTests?: string[]; // Test codes that should be automatically included (e.g., CRP includes HSCRP)

  createdAt: Date;
  updatedAt: Date;
}

export const TestCatalogSchema = SchemaFactory.createForClass(TestCatalog);

// Indexes
TestCatalogSchema.index({ code: 1 }, { unique: true });
TestCatalogSchema.index({ category: 1 });
TestCatalogSchema.index({ isActive: 1 });
