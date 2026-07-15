import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PaymentTypeEnum {
  LAB_ORDER = 'lab_order',
  CONSULTATION = 'consultation',
  PRESCRIPTION = 'prescription',
  PHARMACY_ORDER = 'pharmacy_order',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'payments' })
export class Payment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit', index: true })
  visitId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', index: true })
  orderId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Consultation', index: true })
  consultationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Prescription', index: true })
  prescriptionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TreatmentPlan', index: true })
  treatmentPlanId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Patient', index: true })
  patientId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'InsuranceClaim', index: true })
  insuranceClaimId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(PaymentTypeEnum) })
  paymentType: PaymentTypeEnum;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true })
  paymentMethod: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  receivedBy?: Types.ObjectId;

  @Prop()
  notes?: string;

  @Prop({ default: false })
  isRefunded: boolean;

  /** Insurance authorization is an account receivable until the claim is paid. */
  @Prop({ default: false, index: true })
  isReceivable: boolean;

  @Prop()
  refundReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ visitId: 1, createdAt: -1 });
PaymentSchema.index({ orderId: 1, createdAt: -1 });
PaymentSchema.index({ consultationId: 1, createdAt: -1 });
PaymentSchema.index({ prescriptionId: 1, createdAt: -1 });
