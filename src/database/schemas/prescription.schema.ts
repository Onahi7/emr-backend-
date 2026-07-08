import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PrescriptionStatusEnum {
  PENDING = 'pending',
  DISPENSED = 'dispensed',
  ADMINISTERING = 'administering',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum RouteOfAdministrationEnum {
  ORAL = 'oral',
  SUBLINGUAL = 'sublingual',
  TOPICAL = 'topical',
  INTRAVENOUS = 'intravenous',
  INTRAMUSCULAR = 'intramuscular',
  SUBCUTANEOUS = 'subcutaneous',
  INHALATION = 'inhalation',
  RECTAL = 'rectal',
  OPHTHALMIC = 'ophthalmic',
  OTIC = 'otic',
  NASAL = 'nasal',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'prescriptions' })
export class Prescription extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ required: true })
  prescriptionNumber: string; // RX-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  visitId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Consultation' })
  consultationId?: Types.ObjectId;

  // The system user (doctor/specialist) who wrote this prescription.
  // Always populated from the JWT — this is how pharmacists and reception
  // know which staff member prescribed.
  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  prescribedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  doctorId?: Types.ObjectId;

  @Prop({
    type: [
      {
        medicationId: { type: String, ref: 'Medication', required: true },
        medicationName: { type: String, required: true },
        // === Structured regimen (NEW — replaces free-text dosage/frequency/duration) ===
        /** Strength per dose — e.g. "500mg", "1 tablet", "2 ampules" */
        strengthPerDose: { type: String, required: true },
        /** How many doses per day. e.g. 3 for "3x daily", 4 for "every 6 hours" */
        dosesPerDay: { type: Number, required: true, min: 1 },
        /** Duration in days. e.g. 7 for "1 week", 3 for "3 days" */
        durationDays: { type: Number, required: true, min: 1 },
        /** Total quantity in BASE UNITS (e.g. 6 ampules, 21 tablets). Backend computes from above. */
        quantity: { type: Number, required: true, min: 1 },
        // === Free-text overrides (kept for unusual regimens) ===
        dosage: { type: String },        // legacy / free-text override
        frequency: { type: String },     // legacy / free-text override
        duration: { type: String },      // legacy / free-text override
        route: {
          type: String,
          enum: Object.values(RouteOfAdministrationEnum),
          default: RouteOfAdministrationEnum.ORAL,
        },
        // === Reception dispense data (filled at dispense time) ===
        /** How the receptionist dispensed this — "individual" (1 ampule) or "pack" (1 box) */
        dispenseMode: { type: String, enum: ['individual', 'pack'] },
        /** Which pack variant the receptionist chose (by index into medication.packSizes) */
        packSizeIndex: { type: Number },
        /** Human-readable pack label at dispense time, e.g. "Box of 30 tablets" */
        dispensedPackName: { type: String },
        /** How many base units were actually dispensed (may differ from quantity if partial) */
        dispensedBaseUnits: { type: Number },
        /** Number of sell units dispensed (e.g. 1 box, 6 ampules) */
        dispensedSellUnits: { type: Number },
        /** Price per sell unit at the time of dispensing (in Leones) */
        priceAtDispense: { type: Number },
        /** Per-item line total at dispense time (sell units × price per sell unit) */
        lineTotalAtDispense: { type: Number },
        /** Was this a substitute? If so, the original medicationId the doctor ordered */
        substituteForId: { type: String, ref: 'Medication' },
        substituteForName: { type: String },
        // === Doctor's notes (kept) ===
        // Doctor's patient-facing directions — printed on the dispensing label
        // e.g. "Take 1 tablet by mouth 3 times daily with food for 7 days"
        // e.g. "Apply a thin layer to affected area twice daily"
        instructions: { type: String },
        // Internal note for the pharmacist only — not printed on label
        // e.g. "Counsel patient on photosensitivity", "Refrigerate after opening"
        pharmacistNote: { type: String },
      },
    ],
    required: true,
  })
  items: Array<{
    medicationId: string;
    medicationName: string;
    strengthPerDose: string;
    dosesPerDay: number;
    durationDays: number;
    quantity: number;
    dosage?: string;
    frequency?: string;
    duration?: string;
    route: RouteOfAdministrationEnum;
    dispenseMode?: 'individual' | 'pack';
    packSizeIndex?: number;
    dispensedPackName?: string;
    dispensedBaseUnits?: number;
    dispensedSellUnits?: number;
    priceAtDispense?: number;
    lineTotalAtDispense?: number;
    substituteForId?: string;
    substituteForName?: string;
    instructions?: string;
    pharmacistNote?: string;
  }>;

  @Prop({ required: true, enum: Object.values(PrescriptionStatusEnum) })
  status: PrescriptionStatusEnum;

  // General notes from the doctor (visible to pharmacist and patient)
  @Prop()
  notes?: string;

  // Pharmacist's dispensing notes — added at dispense time
  @Prop()
  dispensingNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  dispensedBy?: Types.ObjectId;

  @Prop()
  dispensedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancellationReason?: string;

  @Prop({ default: false })
  isPaid: boolean;

  @Prop()
  totalAmount?: number; // Prescribed amount (from when doctor wrote it)

  /** Computed at dispense time from reception's actual sell units × price */
  @Prop()
  actualTotalAmount?: number;

  // CAF integration — set when dispensed through CAF
  @Prop()
  cafSaleId?: string;

  @Prop()
  cafReceiptNumber?: string;

  @Prop({ default: false })
  hasCafItems?: boolean;

  // === MAR (Medication Administration Record) tracking ===
  /** Total doses to administer across the full course */
  @Prop({ default: 0 })
  totalDoses: number;

  /** Doses administered so far */
  @Prop({ default: 0 })
  dosesGiven: number;

  /** When the next dose is due (auto-calculated from dosesPerDay) */
  @Prop()
  nextDueAt?: Date;

  /** Route that needs nurse administration (IV, IM, SC, etc.) — oral/tablets for outpatients are not tracked */
  @Prop()
  adminRoute?: string;

  /** Whether this prescription requires nurse administration */
  @Prop({ default: false })
  requiresAdministration: boolean;

  /** Full administration log — each entry is one dose given/refused */
  @Prop({
    type: [
      {
        medicationName: { type: String, required: true },
        dosage: { type: String, required: true },
        route: { type: String, required: true },
        given: { type: Boolean, default: true },
        refused: { type: Boolean, default: false },
        refusalReason: { type: String },
        notes: { type: String },
        administeredBy: { type: Types.ObjectId, ref: 'Profile' },
        administeredByName: { type: String },
        administeredAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  administrationLog: Array<{
    medicationName: string;
    dosage: string;
    route: string;
    given: boolean;
    refused: boolean;
    refusalReason?: string;
    notes?: string;
    administeredBy?: Types.ObjectId;
    administeredByName?: string;
    administeredAt: Date;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

export const PrescriptionSchema = SchemaFactory.createForClass(Prescription);

// Indexes
PrescriptionSchema.index({ branchId: 1, prescriptionNumber: 1 }, { unique: true });
PrescriptionSchema.index({ patientId: 1 });
PrescriptionSchema.index({ consultationId: 1 });
PrescriptionSchema.index({ prescribedBy: 1 });
PrescriptionSchema.index({ status: 1 });
PrescriptionSchema.index({ createdAt: -1 });
PrescriptionSchema.index({ visitId: 1 });
