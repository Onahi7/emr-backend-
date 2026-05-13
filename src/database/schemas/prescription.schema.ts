import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PrescriptionStatusEnum {
  PENDING = 'pending',
  DISPENSED = 'dispensed',
  CANCELLED = 'cancelled',
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
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        duration: { type: String, required: true },
        quantity: { type: Number, required: true },
        instructions: { type: String },
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
    instructions?: string;
  }>;

  @Prop({ required: true, enum: Object.values(PrescriptionStatusEnum) })
  status: PrescriptionStatusEnum;

  @Prop()
  notes?: string;

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
