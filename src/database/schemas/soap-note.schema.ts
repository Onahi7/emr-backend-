import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SoapNoteTypeEnum {
  CONSULTATION = 'consultation',
  FOLLOW_UP = 'follow_up',
  EMERGENCY = 'emergency',
  NURSE_NOTE = 'nurse_note',
}

@Schema({ timestamps: true, collection: 'soap_notes' })
export class SoapNote extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  visitId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Consultation' })
  consultationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(SoapNoteTypeEnum) })
  noteType: SoapNoteTypeEnum;

  // Subjective
  @Prop()
  chiefComplaint?: string;

  @Prop()
  historyPresentIllness?: string;

  @Prop()
  reviewOfSystems?: string;

  // Objective
  @Prop({ type: Object })
  vitalSigns?: {
    bloodPressure?: string;
    temperature?: number;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
    bmi?: number;
  };

  @Prop()
  physicalExamination?: string;

  @Prop()
  laboratoryResults?: string;

  @Prop()
  radiologyResults?: string;

  // Assessment
  @Prop()
  diagnosis?: string;

  @Prop({ type: [String] })
  differentialDiagnosis?: string[];

  // Plan
  @Prop()
  treatmentPlan?: string;

  @Prop()
  medications?: string;

  @Prop()
  followUpInstructions?: string;

  @Prop()
  patientEducation?: string;

  // Metadata
  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  nurseId?: Types.ObjectId;

  @Prop({ default: false })
  isSigned: boolean;

  @Prop()
  signedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  signedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const SoapNoteSchema = SchemaFactory.createForClass(SoapNote);

// Indexes
SoapNoteSchema.index({ patientId: 1, createdAt: -1 });
SoapNoteSchema.index({ consultationId: 1 });
SoapNoteSchema.index({ doctorId: 1 });
SoapNoteSchema.index({ createdAt: -1 });
SoapNoteSchema.index({ visitId: 1 });
