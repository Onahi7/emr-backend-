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

export enum VisitServiceTypeEnum {
  NORMAL_CONSULTATION = 'normal_consultation',
  SPECIALIST_CONSULTATION = 'specialist_consultation',
  OBSERVATION_4H = 'observation_4h',
  PROCEDURE = 'procedure',
}

/** How the consultation itself was covered. This is deliberately separate from
 * the requested payment method so eligibility can be calculated consistently. */
export enum ConsultationCoverageTypeEnum {
  PENDING = 'pending',
  PAID = 'paid',
  FOLLOW_UP = 'follow_up',
  INSURANCE = 'insurance',
}

@Schema({ _id: false, timestamps: false })
export class RapidTestResult {
  @Prop({ required: true, enum: ['malaria', 'typhoid'] })
  testType: 'malaria' | 'typhoid';

  @Prop({ required: true, enum: ['positive', 'negative'] })
  result: 'positive' | 'negative';

  /** Parasite count per microliter — only relevant for malaria */
  @Prop()
  parasiteCount?: number;

  /** Antigen tested — p.f, pan, p.v for malaria; TOG/IgM/IgG for typhoid */
  @Prop()
  antigen?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  performedBy?: Types.ObjectId;

  @Prop({ default: () => new Date() })
  performedAt: Date;
}
export const RapidTestResultSchema = SchemaFactory.createForClass(RapidTestResult);

@Schema({ timestamps: true, collection: 'visits' })
export class Visit extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ required: true })
  visitNumber: string; // VIS-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  // The treating doctor (Doctor record) who is managing this visit.
  // Set from the nurse triage doctor dropdown (Doctor _id) or from req.user.doctorId when the doctor accepts the patient.
  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  doctorId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(VisitTypeEnum), default: VisitTypeEnum.NEW })
  visitType: VisitTypeEnum;

  @Prop({ required: true, enum: Object.values(VisitStatusEnum), default: VisitStatusEnum.WAITING_PAYMENT })
  status: VisitStatusEnum;

  @Prop({ default: 0 })
  consultationFee: number;

  @Prop({ default: false })
  consultationPaid: boolean;

  @Prop({ enum: Object.values(ConsultationCoverageTypeEnum), default: ConsultationCoverageTypeEnum.PENDING, index: true })
  consultationCoverageType: ConsultationCoverageTypeEnum;

  @Prop({ enum: ['cash', 'orange_money', 'afrimoney', 'wallet', 'card', 'insurance'], default: 'cash' })
  consultationPaymentMethod?: string;

  /** Billable service picked at reception — drives downstream workflow
   *  (specialist routing, procedure prep, rapid test entry) */
  @Prop({ enum: Object.values(VisitServiceTypeEnum) })
  serviceType?: VisitServiceTypeEnum;

  /** Specialist (Doctor._id) the visit was booked with at reception */
  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  specialistId?: Types.ObjectId;

  /** Procedure name/type the visit was booked for */
  @Prop()
  procedureType?: string;

  /** In-house rapid test results (malaria/typhoid) entered by nurse — not LIS */
  @Prop({ type: [RapidTestResultSchema], default: [] })
  rapidTestResults: RapidTestResult[];

  /** Rapid tests requested upfront alongside consultation */
  @Prop({ type: [String], enum: ['malaria', 'typhoid'], default: [] })
  rapidTestsRequested?: ('malaria' | 'typhoid')[];

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

  @Prop({ default: false })
  triageAlert?: boolean;

  @Prop({ type: [String], default: [] })
  triageAlerts?: string[];

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

  // Insurance snapshot from patient at time of visit
  @Prop({ type: {
    programCode: String,
    subEntityCode: String,
    memberNumber: String,
    memberName: String,
    responsiblePerson: String,
    responsiblePhone: String,
  }})
  insurance?: {
    programCode?: string;
    subEntityCode?: string;
    memberNumber?: string;
    memberName?: string;
    responsiblePerson?: string;
    responsiblePhone?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

export const VisitSchema = SchemaFactory.createForClass(Visit);

// Indexes
VisitSchema.index({ branchId: 1, visitNumber: 1 }, { unique: true });
VisitSchema.index({ patientId: 1 });
VisitSchema.index({ doctorId: 1 });
VisitSchema.index({ status: 1 });
VisitSchema.index({ createdAt: -1 });
VisitSchema.index({ consultationPaid: 1, status: 1 });
VisitSchema.index({ branchId: 1, patientId: 1, consultationCoverageType: 1, createdAt: -1 });
