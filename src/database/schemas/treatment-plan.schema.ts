import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TreatmentPlanStatusEnum {
  DRAFT = 'draft',
  SENT_TO_RECEPTION = 'sent_to_reception',
  PAID = 'paid',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum TreatmentPlanPaymentStatusEnum {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid',
}

export enum TreatmentPlanItemTypeEnum {
  DRUG = 'drug',
  IV = 'iv',
  LAB = 'lab',
  PROCEDURE = 'procedure',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'treatment_plans' })
export class TreatmentPlan extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ required: true })
  planNumber: string; // TP-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true, index: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit', index: true })
  visitId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true })
  createdByName: string;

  @Prop({ required: true })
  createdByRole: string; // 'nurse' | 'doctor' | 'specialist'

  @Prop({ required: true, enum: Object.values(TreatmentPlanStatusEnum), default: TreatmentPlanStatusEnum.DRAFT })
  status: TreatmentPlanStatusEnum;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Prescription' }] })
  prescriptionIds: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Order' }] })
  orderIds: Types.ObjectId[];

  @Prop({
    type: [
      {
        type: { type: String, enum: Object.values(TreatmentPlanItemTypeEnum), required: true },
        description: { type: String, required: true },
        amount: { type: Number, default: 0 },
        refId: { type: Types.ObjectId },
      },
    ],
    default: [],
  })
  items: Array<{
    type: TreatmentPlanItemTypeEnum;
    description: string;
    amount: number;
    refId?: Types.ObjectId;
  }>;

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  amountPaid: number;

  @Prop({ default: 0 })
  balance: number;

  @Prop({ required: true, enum: Object.values(TreatmentPlanPaymentStatusEnum), default: TreatmentPlanPaymentStatusEnum.UNPAID })
  paymentStatus: TreatmentPlanPaymentStatusEnum;

  @Prop()
  notes?: string;

  @Prop()
  sentToReceptionAt?: Date;

  @Prop()
  printedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  printedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const TreatmentPlanSchema = SchemaFactory.createForClass(TreatmentPlan);

// Indexes
TreatmentPlanSchema.index({ branchId: 1, planNumber: 1 }, { unique: true });
TreatmentPlanSchema.index({ patientId: 1 });
TreatmentPlanSchema.index({ visitId: 1 });
TreatmentPlanSchema.index({ status: 1 });
TreatmentPlanSchema.index({ createdAt: -1 });
