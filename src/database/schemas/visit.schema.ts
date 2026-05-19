import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum VisitStatusEnum {
  WAITING_PAYMENT = 'waiting_payment',           // Created, consultation fee not yet paid
  AWAITING_TRIAGE = 'awaiting_triage',           // Paid, waiting for nurse vitals/triage
  IN_QUEUE = 'in_queue',                         // Triage completed, waiting for doctor
  IN_CONSULTATION = 'in_consultation',           // Doctor accepted, in consultation
  AWAITING_LAB = 'awaiting_lab',                // Doctor ordered lab, awaiting payment
  AWAITING_PHARMACY = 'awaiting_pharmacy',      // Doctor prescribed, awaiting payment
  AWAITING_RESULTS = 'awaiting_results',        // Lab paid, waiting for results
  RESULTS_READY = 'results_ready',              // Results released, doctor reviewing
  AWAITING_DISPENSING = 'awaiting_dispensing',  // Pharmacy paid, waiting for pharmacist to dispense
  AWAITING_DOCTOR_REVIEW = 'awaiting_doctor_review', // Service done, doctor must close/continue encounter
  ADMITTED = 'admitted',                        // Patient admitted (inpatient, nurse-managed)
  REFERRED = 'referred',                        // Referred to specialist
  COMPLETED = 'completed',                      // Visit closed
  CANCELLED = 'cancelled',                      // Visit cancelled
}

export enum VisitTypeEnum {
  NEW = 'new',
  FOLLOW_UP = 'follow_up',
  EMERGENCY = 'emergency',
}

@Schema({ timestamps: true, collection: 'visits' })
export class Visit extends Document {
  @Prop({ required: true, unique: true })
  visitNumber: string; // VIS-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  // The treating doctor (system user — Profile) who is managing this visit.
  // Set from req.user.userId when the doctor accepts the patient.
  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  doctorId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(VisitTypeEnum), default: VisitTypeEnum.NEW })
  visitType: VisitTypeEnum;

  @Prop({ required: true, enum: Object.values(VisitStatusEnum), default: VisitStatusEnum.WAITING_PAYMENT })
  status: VisitStatusEnum;

  @Prop({ required: true })
  consultationFee: number;

  @Prop({ default: false })
  consultationPaid: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  consultationOrderId?: Types.ObjectId;

  @Prop()
  chiefComplaint?: string;

  @Prop()
  notes?: string;

  // Vitals
  @Prop()
  temperature?: number;

  @Prop()
  bloodPressure?: string; // Format: "120/80"

  @Prop()
  heartRate?: number;

  @Prop()
  respiratoryRate?: number;

  @Prop()
  weight?: number;

  @Prop()
  height?: number;

  @Prop()
  oxygenSaturation?: number;

  // SOAP Notes
  @Prop()
  subjectiveNotes?: string;

  @Prop()
  objectiveNotes?: string;

  @Prop()
  assessmentNotes?: string;

  @Prop()
  planNotes?: string;

  @Prop()
  diagnosis?: string;

  // Problem list — active diagnoses for this visit (ICD-10 compatible)
  @Prop({ type: [{ code: String, name: String, status: String, notedAt: Date }] })
  problemList?: Array<{
    code?: string;      // ICD-10 code (e.g., "E11.9")
    name: string;       // Diagnosis name
    status?: string;    // "active", "resolved", "chronic"
    notedAt?: Date;     // When this problem was first noted
  }>;

  // Follow-up
  @Prop()
  followUpDate?: Date;

  @Prop()
  followUpNotes?: string;

  // Triage (nurse)
  @Prop({ enum: ['low', 'normal', 'high', 'urgent', 'emergency'] })
  triagePriority?: string;

  @Prop()
  triageNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  triagedBy?: Types.ObjectId;

  @Prop()
  triagedAt?: Date;

  // Referral to specialist — this IS an external doctor reference
  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  referredToSpecialistId?: Types.ObjectId;

  @Prop()
  referralReason?: string;

  @Prop()
  referralNotes?: string;

  @Prop()
  referredAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  registeredBy?: Types.ObjectId;

  @Prop()
  checkedInAt?: Date;

  @Prop()
  consultationStartedAt?: Date;

  @Prop()
  consultationCompletedAt?: Date;

  @Prop()
  dischargedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  dischargedBy?: Types.ObjectId;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancellationReason?: string;

  // Room/location assignment
  @Prop()
  room?: string; // e.g., "treatment-room-1", "procedure-room-2", "consultation-room-1"

  @Prop()
  roomType?: string; // "consultation", "treatment", "procedure", "emergency"

  createdAt: Date;
  updatedAt: Date;
}

export const VisitSchema = SchemaFactory.createForClass(Visit);

// Indexes
VisitSchema.index({ visitNumber: 1 }, { unique: true });
VisitSchema.index({ patientId: 1 });
VisitSchema.index({ doctorId: 1 });
VisitSchema.index({ status: 1 });
VisitSchema.index({ createdAt: -1 });
VisitSchema.index({ consultationPaid: 1, status: 1 });
