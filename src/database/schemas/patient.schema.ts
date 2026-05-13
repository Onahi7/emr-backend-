import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum GenderEnum {
  MALE = 'M',
  FEMALE = 'F',
  OTHER = 'O',
}

export enum AgeUnitEnum {
  YEARS = 'years',
  MONTHS = 'months',
  WEEKS = 'weeks',
  DAYS = 'days',
}

export enum PatientCategoryEnum {
  PRIVATE = 'private',
  NHIS = 'nhis',
  CORPORATE = 'corporate',
  FAMILY = 'family',
  STAFF = 'staff',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'patients' })
export class Patient extends Document {
  @Prop({ required: true, unique: true })
  patientId: string; // PAT-YYYYMMDD-XXXX

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop()
  dateOfBirth?: Date;

  @Prop({ required: true })
  age: number;

  @Prop()
  ageValue?: number;

  @Prop({ enum: Object.values(AgeUnitEnum) })
  ageUnit?: AgeUnitEnum;

  @Prop({ required: true, enum: Object.values(GenderEnum) })
  gender: GenderEnum;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop()
  occupation?: string;

  @Prop()
  nationality?: string;

  @Prop({ sparse: true, unique: true })
  mrn?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  registeredBy?: Types.ObjectId;

  // Patient category for billing
  @Prop({ enum: Object.values(PatientCategoryEnum), default: PatientCategoryEnum.PRIVATE })
  patientCategory: PatientCategoryEnum;

  // Next of kin
  @Prop()
  nextOfKinName?: string;

  @Prop()
  nextOfKinPhone?: string;

  @Prop()
  nextOfKinRelationship?: string;

  // EMR fields
  @Prop()
  bloodType?: string;

  @Prop({ type: [String] })
  allergies?: string[];

  @Prop({ type: [String] })
  chronicConditions?: string[];

  @Prop()
  medicalHistory?: string;

  @Prop()
  currentMedications?: string;

  // Legacy emergency contact (kept for backward compat)
  @Prop()
  emergencyContactName?: string;

  @Prop()
  emergencyContactPhone?: string;

  // Insurance / corporate billing
  @Prop()
  insuranceProvider?: string;

  @Prop()
  insurancePolicyNumber?: string;

  @Prop()
  corporateEmployer?: string;

  @Prop()
  corporateStaffId?: string;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

// Indexes
PatientSchema.index({ patientId: 1 }, { unique: true });
PatientSchema.index({ firstName: 1, lastName: 1 });
PatientSchema.index({ mrn: 1 }, { sparse: true, unique: true });

// Text search index for name search
PatientSchema.index({ firstName: 'text', lastName: 'text' });
