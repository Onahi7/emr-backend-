import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ExpenseCategoryEnum {
  SUPPLIES = 'supplies',
  REAGENTS = 'reagents',
  EQUIPMENT = 'equipment',
  UTILITIES = 'utilities',
  TRANSPORT = 'transport',
  MAINTENANCE = 'maintenance',
  STAFF = 'staff',
  CLEANING = 'cleaning',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Expenditure extends Document {
  @Prop({ required: true })
  description: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    required: true,
    enum: ExpenseCategoryEnum,
    default: ExpenseCategoryEnum.OTHER,
  })
  category: ExpenseCategoryEnum;

  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true })
  recordedBy: Types.ObjectId;

  @Prop({ required: true })
  expenditureDate: Date;

  @Prop({ default: 'cash', enum: ['cash', 'mobile_money', 'bank_transfer', 'other'] })
  paymentMethod: string;

  @Prop()
  receiptNumber?: string;

  @Prop()
  vendor?: string;

  @Prop()
  notes?: string;

  // Instead of approval, admin can flag an expenditure if it's suspicious
  @Prop({ default: false })
  flagged: boolean;

  @Prop()
  flagReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  flaggedBy?: Types.ObjectId;

  @Prop()
  flaggedAt?: Date;
}

export const ExpenditureSchema = SchemaFactory.createForClass(Expenditure);

// Index for date-based queries
ExpenditureSchema.index({ expenditureDate: -1 });
ExpenditureSchema.index({ category: 1 });
ExpenditureSchema.index({ recordedBy: 1 });
