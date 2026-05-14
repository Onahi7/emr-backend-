import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PrescriptionStatusEnum {
  PENDING = 'pending',
  DISPENSED = 'dispensed',
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
  @Prop({ required: true, unique: true })
  prescriptionNumber: string; // RX-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  visitId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Consultation' })
  consultationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId: Types.ObjectId;

  @Prop({
    type: [
      {
        medicationId: { type: Types.ObjectId, ref: 'Medication', required: true },
        medicationName: { type: String, required: true },
        dosage: { type: String, required: true },       // e.g. "500mg", "1 tablet"
        frequency: { type: String, required: true },    // e.g. "3 times daily", "every 8 hours"
        duration: { type: String, required: true },     // e.g. "7 days", "2 weeks"
        quantity: { type: Number, required: true },     // total units to dispense
        route: {
          type: String,
          enum: Object.values(RouteOfAdministrationEnum),
          default: RouteOfAdministrationEnum.ORAL,
        },
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
    medicationId: Types.ObjectId;
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
    route: RouteOfAdministrationEnum;
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
  totalAmount?: number;

  createdAt: Date;
  updatedAt: Date;
}

export const PrescriptionSchema = SchemaFactory.createForClass(Prescription);

// Indexes
PrescriptionSchema.index({ prescriptionNumber: 1 }, { unique: true });
PrescriptionSchema.index({ patientId: 1 });
PrescriptionSchema.index({ consultationId: 1 });
PrescriptionSchema.index({ doctorId: 1 });
PrescriptionSchema.index({ status: 1 });
PrescriptionSchema.index({ createdAt: -1 });
PrescriptionSchema.index({ visitId: 1 });
