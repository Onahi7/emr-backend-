import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReconciliationStatusEnum {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'cash_reconciliations' })
export class CashReconciliation extends Document {
  @Prop({ required: true, type: Date })
  reconciliationDate: Date; // The business day being reconciled

  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true })
  submittedBy: Types.ObjectId; // Receptionist who submitted

  @Prop({ required: true })
  submittedAt: Date;

  // Expected amounts from system
  @Prop({ required: true })
  expectedCash: number;

  @Prop({ required: true })
  expectedOrangeMoney: number;

  @Prop({ required: true })
  expectedAfrimoney: number;

  @Prop({ required: true })
  expectedTotal: number;

  // Actual amounts counted by receptionist
  @Prop({ required: true })
  actualCash: number;

  @Prop({ required: true })
  actualOrangeMoney: number;

  @Prop({ required: true })
  actualAfrimoney: number;

  @Prop({ required: true })
  actualTotal: number;

  // Variances
  @Prop({ required: true })
  cashVariance: number; // actualCash - expectedCash

  @Prop({ required: true })
  orangeMoneyVariance: number;

  @Prop({ required: true })
  afrimoneyVariance: number;

  @Prop({ required: true })
  totalVariance: number;

  // Order counts
  @Prop({ required: true })
  totalOrders: number;

  @Prop({ required: true })
  paidOrders: number;

  @Prop({ required: true })
  pendingOrders: number;

  // Notes and status
  @Prop()
  notes?: string; // Receptionist notes about discrepancies

  @Prop({
    required: true,
    enum: Object.values(ReconciliationStatusEnum),
    default: ReconciliationStatusEnum.PENDING,
  })
  status: ReconciliationStatusEnum;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  reviewedBy?: Types.ObjectId; // Admin who reviewed

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNotes?: string; // Admin notes

  createdAt: Date;
  updatedAt: Date;
}

export const CashReconciliationSchema = SchemaFactory.createForClass(CashReconciliation);

// Indexes
CashReconciliationSchema.index({ reconciliationDate: -1 });
CashReconciliationSchema.index({ submittedBy: 1 });
CashReconciliationSchema.index({ status: 1 });
CashReconciliationSchema.index({ reconciliationDate: 1, status: 1 });
