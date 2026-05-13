import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum OrderTypeEnum {
  CONSULTATION = 'consultation',
  LAB = 'lab',
  PHARMACY = 'pharmacy',
  PROCEDURE = 'procedure',
  ADMISSION = 'admission',
  OTHER = 'other',
}

export enum OrderStatusEnum {
  AWAITING_PAYMENT = 'awaiting_payment',   // Created by Doctor/Admin, not yet paid
  PAID = 'paid',                           // Payment confirmed by Reception
  PENDING_COLLECTION = 'pending_collection', // Lab: paid, waiting for sample collection
  COLLECTED = 'collected',                 // Lab: sample collected
  PROCESSING = 'processing',               // Lab: in progress / Pharmacy: dispensing
  COMPLETED = 'completed',                 // Service delivered
  CANCELLED = 'cancelled',
}

export enum PaymentStatusEnum {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIAL = 'partial',
  REFUNDED = 'refunded',
}

export enum PriorityEnum {
  ROUTINE = 'routine',
  URGENT = 'urgent',
  STAT = 'stat',
}

export enum DiscountTypeEnum {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export enum PaymentMethodEnum {
  CASH = 'cash',
  ORANGE_MONEY = 'orange_money',
  AFRIMONEY = 'afrimoney',
}

@Schema({ timestamps: true, collection: 'orders' })
export class Order extends Document {
  @Prop({ required: true, unique: true })
  orderNumber: string; // ORD-YYYYMMDD-XXXX

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  visitId?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(OrderTypeEnum), default: OrderTypeEnum.LAB })
  orderType: OrderTypeEnum;

  @Prop({
    required: true,
    enum: Object.values(OrderStatusEnum),
  })
  status: OrderStatusEnum;

  @Prop({ required: true, enum: Object.values(PriorityEnum) })
  priority: PriorityEnum;

  @Prop({ required: true })
  subtotal: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ enum: Object.values(DiscountTypeEnum) })
  discountType?: DiscountTypeEnum;

  @Prop({ required: true })
  total: number;

  @Prop({
    required: true,
    enum: Object.values(PaymentStatusEnum),
    default: PaymentStatusEnum.PENDING,
  })
  paymentStatus: PaymentStatusEnum;

  @Prop({ enum: Object.values(PaymentMethodEnum) })
  paymentMethod?: PaymentMethodEnum;

  @Prop({ default: 0 })
  amountPaid: number;

  @Prop({ default: 0 })
  balance: number;

  @Prop()
  notes?: string;

  @Prop()
  referredByDoctor?: string;

  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  doctorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  orderedBy?: Types.ObjectId;

  @Prop()
  collectedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  collectedBy?: Types.ObjectId;

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

export const OrderSchema = SchemaFactory.createForClass(Order);

// Indexes
OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ patientId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ doctorId: 1 });
OrderSchema.index({ visitId: 1 });
OrderSchema.index({ orderType: 1 });
OrderSchema.index({ orderType: 1, status: 1 });
