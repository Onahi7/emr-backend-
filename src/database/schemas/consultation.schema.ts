import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ConsultationStatusEnum {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ConsultationTypeEnum {
  NEW = 'new',
  FOLLOW_UP = 'follow_up',
  EMERGENCY = 'emergency',
}

@Schema({ timestamps: true, collection: 'consultations' })
export class Consultation extends Document {
  @Prop({ required: true, unique: true })
  consultationNumber: string; // CONS-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  visitId?: Types.ObjectId;

  // The treating doctor (system user — Profile) who conducted this consultation.
  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true })
  doctorId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ConsultationTypeEnum) })
  consultationType: ConsultationTypeEnum;

  @Prop({ required: true, enum: Object.values(ConsultationStatusEnum) })
  status: ConsultationStatusEnum;

  @Prop({ required: true })
  consultationFee: number;

  @Prop({ default: false })
  isPaid: boolean;

  @Prop()
  chiefComplaint?: string;

  @Prop()
  diagnosis?: string;

  @Prop()
  treatment?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Object })
  vitalSigns?: {
    bloodPressure?: string;
    temperature?: number;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
  };

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  nurseId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  checkedInBy?: Types.ObjectId;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancellationReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

// Indexes
ConsultationSchema.index({ consultationNumber: 1 }, { unique: true });
ConsultationSchema.index({ patientId: 1 });
ConsultationSchema.index({ doctorId: 1 });
ConsultationSchema.index({ status: 1 });
ConsultationSchema.index({ createdAt: -1 });
ConsultationSchema.index({ visitId: 1 });
