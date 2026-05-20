import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum WalletTransactionTypeEnum {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  PAYMENT = 'payment',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}

@Schema({ timestamps: true, collection: 'wallet_transactions' })
export class WalletTransaction extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(WalletTransactionTypeEnum) })
  type: WalletTransactionTypeEnum;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 0 })
  balanceBefore: number;

  @Prop({ default: 0 })
  balanceAfter: number;

  @Prop()
  reference?: string;

  @Prop({ enum: ['cash', 'orange_money', 'afrimoney', 'wallet', 'other'] })
  paymentMethod?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  performedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

WalletTransactionSchema.index({ patientId: 1, createdAt: -1 });
WalletTransactionSchema.index({ performedBy: 1 });
