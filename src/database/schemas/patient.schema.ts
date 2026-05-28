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
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ required: true })
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

  @Prop({ required: true })
  phone: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop()
  occupation?: string;

  @Prop()
  nationality?: string;

  @Prop({ sparse: true })
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

  // Structured allergy data for clinical alerts
  @Prop({ type: [{ allergen: String, severity: String, reaction: String, diagnosedAt: Date }] })
  allergyDetails?: Array<{
    allergen: string;     // e.g., "Penicillin", "Sulfa drugs"
    severity?: string;    // "mild", "moderate", "severe", "life-threatening"
    reaction?: string;    // e.g., "Rash", "Anaphylaxis"
    diagnosedAt?: Date;   // When allergy was diagnosed
  }>;

  @Prop({ type: [String] })
  chronicConditions?: string[];

  @Prop()
  medicalHistory?: string;

  @Prop()
  currentMedications?: string;

  // Structured medication list for reconciliation
  @Prop({ type: [{ name: String, dosage: String, frequency: String, prescribedBy: String, startedAt: Date, stoppedAt: Date, active: Boolean }] })
  medicationList?: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    prescribedBy?: string;
    startedAt?: Date;
    stoppedAt?: Date;
    active: boolean;
  }>;

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

  // Wallet system
  @Prop({ default: 0 })
  walletBalance: number;

  @Prop()
  walletLastUpdated?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

// Indexes
PatientSchema.index({ branchId: 1, patientId: 1 }, { unique: true });
PatientSchema.index({ firstName: 1, lastName: 1 });
PatientSchema.index({ branchId: 1, mrn: 1 }, { sparse: true, unique: true });

// Text search index for name search
PatientSchema.index({ firstName: 'text', lastName: 'text' });
