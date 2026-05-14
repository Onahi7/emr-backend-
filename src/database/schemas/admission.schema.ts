import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum AdmissionStatusEnum {
  ADMITTED = 'admitted',
  DISCHARGED = 'discharged',
  TRANSFERRED = 'transferred',
  DECEASED = 'deceased',
}

export enum WardTypeEnum {
  GENERAL = 'general',
  PRIVATE = 'private',
  ICU = 'icu',
  MATERNITY = 'maternity',
  PEDIATRIC = 'pediatric',
  ISOLATION = 'isolation',
}

export enum FluidDirectionEnum {
  INTAKE = 'intake',
  OUTPUT = 'output',
}

// ---------- Sub-schemas ----------

@Schema({ _id: false, timestamps: false })
export class VitalsReading {
  @Prop() temperature?: number;
  @Prop() bloodPressure?: string; // "120/80"
  @Prop() heartRate?: number;
  @Prop() respiratoryRate?: number;
  @Prop() oxygenSaturation?: number;
  @Prop() painScale?: number; // 0-10
  @Prop() bloodGlucose?: number;
  @Prop() consciousnessLevel?: string; // AVPU, GCS score
  @Prop() notes?: string;
  @Prop({ type: Types.ObjectId, ref: 'Profile' }) recordedBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) recordedAt: Date;
}
export const VitalsReadingSchema = SchemaFactory.createForClass(VitalsReading);

@Schema({ _id: false, timestamps: false })
export class MedicationAdministration {
  @Prop({ type: Types.ObjectId, ref: 'Medication' }) medicationId?: Types.ObjectId;
  @Prop() medicationName: string;
  @Prop() dosage: string;
  @Prop() route?: string; // PO, IV, IM, SC, topical, inhalation
  @Prop({ type: Types.ObjectId, ref: 'Prescription' }) prescriptionId?: Types.ObjectId;
  @Prop({ default: false }) refused?: boolean;
  @Prop() refusalReason?: string;
  @Prop() notes?: string;
  @Prop({ type: Types.ObjectId, ref: 'Profile' }) administeredBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) administeredAt: Date;
}
export const MedicationAdministrationSchema = SchemaFactory.createForClass(MedicationAdministration);

@Schema({ _id: false, timestamps: false })
export class FluidEntry {
  @Prop({ required: true, enum: Object.values(FluidDirectionEnum) })
  direction: FluidDirectionEnum;

  @Prop({ required: true })
  fluidType: string; // 'normal saline', 'oral water', 'urine', 'vomitus', 'NG drainage'

  @Prop({ required: true })
  volumeMl: number;

  @Prop() route?: string; // PO, IV, NG, urinary
  @Prop() notes?: string;
  @Prop({ type: Types.ObjectId, ref: 'Profile' }) recordedBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) recordedAt: Date;
}
export const FluidEntrySchema = SchemaFactory.createForClass(FluidEntry);

@Schema({ _id: false, timestamps: false })
export class NursingNote {
  @Prop() subjective?: string;
  @Prop() objective?: string;
  @Prop() assessment?: string;
  @Prop() plan?: string;
  @Prop() narrative?: string; // free-text fallback
  @Prop({ type: Types.ObjectId, ref: 'Profile' }) authoredBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) authoredAt: Date;
}
export const NursingNoteSchema = SchemaFactory.createForClass(NursingNote);

@Schema({ _id: false, timestamps: false })
export class CarePlanItem {
  @Prop({ required: true }) problem: string; // "Risk of infection"
  @Prop() goal?: string; // "Remain afebrile"
  @Prop({ type: [String], default: [] }) interventions: string[];
  @Prop() evaluation?: string;
  @Prop({ enum: ['active', 'resolved', 'ongoing'], default: 'active' }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'Profile' }) createdBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) createdAt: Date;
  @Prop() resolvedAt?: Date;
}
export const CarePlanItemSchema = SchemaFactory.createForClass(CarePlanItem);

@Schema({ _id: false, timestamps: false })
export class IncidentReport {
  @Prop({ required: true })
  incidentType: string; // fall, medication error, equipment failure, etc.

  @Prop({ required: true }) description: string;
  @Prop({ enum: ['minor', 'moderate', 'severe'], default: 'minor' }) severity: string;
  @Prop() actionTaken?: string;
  @Prop({ type: [String], default: [] }) witnessesOrStaff: string[];
  @Prop({ type: Types.ObjectId, ref: 'Profile' }) reportedBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) occurredAt: Date;
}
export const IncidentReportSchema = SchemaFactory.createForClass(IncidentReport);

@Schema({ _id: false, timestamps: false })
export class ShiftHandover {
  @Prop({ required: true })
  shift: string; // morning, afternoon, night

  @Prop() conditionSummary?: string;
  @Prop() latestVitalsSummary?: string;
  @Prop() pendingLabs?: string;
  @Prop() medicationsDue?: string;
  @Prop() fluidBalanceConcern?: string;
  @Prop() risksAndAllergies?: string;
  @Prop() tasksForNextShift?: string;
  @Prop() receivingNurse?: string;
  @Prop() notes?: string;
  @Prop({ type: Types.ObjectId, ref: 'Profile' }) handedOverBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) handedOverAt: Date;
}
export const ShiftHandoverSchema = SchemaFactory.createForClass(ShiftHandover);

// ---------- Admission ----------

@Schema({ timestamps: true, collection: 'admissions' })
export class Admission extends Document {
  @Prop({ required: true, unique: true })
  admissionNumber: string; // ADM-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  visitId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  doctorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  primaryNurseId?: Types.ObjectId;

  @Prop({ enum: Object.values(WardTypeEnum), default: WardTypeEnum.GENERAL })
  wardType: WardTypeEnum;

  @Prop()
  bedNumber?: string;

  @Prop({ required: true })
  admissionReason: string;

  @Prop()
  diagnosis?: string;

  @Prop({ type: [String], default: [] })
  allergies: string[];

  @Prop({ type: [String], default: [] })
  dietaryRestrictions: string[];

  @Prop({ type: [String], default: [] })
  precautions: string[]; // fall risk, isolation, DVT, etc.

  @Prop({ enum: ['full_code', 'dnr', 'dni'], default: 'full_code' })
  codeStatus: string;

  @Prop({ enum: Object.values(AdmissionStatusEnum), default: AdmissionStatusEnum.ADMITTED })
  status: AdmissionStatusEnum;

  @Prop({ default: () => new Date() })
  admittedAt: Date;

  @Prop()
  dischargedAt?: Date;

  @Prop()
  dischargeNotes?: string;

  @Prop()
  dischargeDiagnosis?: string;

  @Prop()
  dischargeInstructions?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  dischargedBy?: Types.ObjectId;

  @Prop({ type: [VitalsReadingSchema], default: [] })
  vitalsLog: VitalsReading[];

  @Prop({ type: [MedicationAdministrationSchema], default: [] })
  medicationLog: MedicationAdministration[];

  @Prop({ type: [FluidEntrySchema], default: [] })
  fluidBalance: FluidEntry[];

  @Prop({ type: [NursingNoteSchema], default: [] })
  nursingNotes: NursingNote[];

  @Prop({ type: [CarePlanItemSchema], default: [] })
  carePlan: CarePlanItem[];

  @Prop({ type: [IncidentReportSchema], default: [] })
  incidents: IncidentReport[];

  @Prop({ type: [ShiftHandoverSchema], default: [] })
  shiftHandovers: ShiftHandover[];

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  admittedBy?: Types.ObjectId;

  @Prop()
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const AdmissionSchema = SchemaFactory.createForClass(Admission);
AdmissionSchema.index({ admissionNumber: 1 }, { unique: true });
AdmissionSchema.index({ patientId: 1 });
AdmissionSchema.index({ status: 1 });
AdmissionSchema.index({ wardType: 1, status: 1 });
AdmissionSchema.index({ primaryNurseId: 1, status: 1 });
