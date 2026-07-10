import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ClaimStatusEnum {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  PARTIALLY_APPROVED = 'partially_approved',
  REJECTED = 'rejected',
  PAID = 'paid',
}

export enum ClaimItemTypeEnum {
  LAB_ORDER = 'lab_order',
  PRESCRIPTION = 'prescription',
  PROCEDURE = 'procedure',
  CONSULTATION = 'consultation',
  OTHER = 'other',
}

@Schema({ _id: false, timestamps: false })
export class ClaimItem {
  @Prop({ required: true, enum: Object.values(ClaimItemTypeEnum) })
  itemType: ClaimItemTypeEnum;

  @Prop({ type: Types.ObjectId, required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ default: 1, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ default: true })
  coveredByInsurance: boolean;
}
export const ClaimItemSchema = SchemaFactory.createForClass(ClaimItem);

@Schema({ timestamps: true, collection: 'insurance-claims' })
export class InsuranceClaim extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Visit', required: true, index: true })
  visitId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true, index: true })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch' })
  branchId?: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true, index: true })
  programCode: string;

  @Prop({ trim: true })
  subEntityCode?: string;

  @Prop({ trim: true })
  memberNumber?: string;

  @Prop({ trim: true })
  memberName?: string;

  @Prop({ type: [ClaimItemSchema], default: [] })
  items: ClaimItem[];

  @Prop({ default: 0, min: 0 })
  totalAmount: number;

  @Prop({ default: 0, min: 0 })
  claimedAmount: number;

  @Prop({ default: 0, min: 0 })
  patientAmount: number;

  @Prop({ required: true, enum: Object.values(ClaimStatusEnum), default: ClaimStatusEnum.DRAFT, index: true })
  status: ClaimStatusEnum;

  @Prop()
  submittedAt?: Date;

  @Prop()
  approvedAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop({ default: 0, min: 0 })
  approvedAmount: number;

  @Prop({ default: 0, min: 0 })
  paidAmount: number;

  @Prop()
  rejectionReason?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  createdBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const InsuranceClaimSchema = SchemaFactory.createForClass(InsuranceClaim);
InsuranceClaimSchema.index({ visitId: 1 });
InsuranceClaimSchema.index({ patientId: 1, status: 1 });
InsuranceClaimSchema.index({ programCode: 1, status: 1 });
InsuranceClaimSchema.index({ branchId: 1, status: 1 });
export type InsuranceClaimDocument = InsuranceClaim & Document;
