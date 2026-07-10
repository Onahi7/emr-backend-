import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InsuranceBlockDocument = InsuranceBlock & Document;

export enum BlockReasonEnum {
  QUOTA_EXHAUSTED = 'quota_exhausted',
  NO_LONGER_COVERED = 'no_longer_covered',
  POLICY_CANCELLED = 'policy_cancelled',
  DELETED_FROM_SYSTEM = 'deleted_from_system',
  OTHER = 'other',
}

export const BLOCK_REASON_LABELS: Record<string, string> = {
  [BlockReasonEnum.QUOTA_EXHAUSTED]: 'Quota Exhausted',
  [BlockReasonEnum.NO_LONGER_COVERED]: 'No Longer Covered',
  [BlockReasonEnum.POLICY_CANCELLED]: 'Policy Cancelled',
  [BlockReasonEnum.DELETED_FROM_SYSTEM]: 'Deleted from Insurance System',
  [BlockReasonEnum.OTHER]: 'Other',
};

@Schema({ timestamps: true })
export class InsuranceBlock extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  @Prop({ trim: true })
  patientName: string;

  @Prop({ trim: true })
  memberNumber: string;

  @Prop({ required: true, trim: true })
  programCode: string;

  @Prop({ trim: true })
  subEntityCode: string;

  @Prop({ required: true, enum: Object.values(BlockReasonEnum) })
  reason: BlockReasonEnum;

  @Prop({ trim: true })
  reasonDetail: string;

  @Prop()
  effectiveDate: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  addedBy: Types.ObjectId;

  @Prop({ trim: true })
  notes: string;
}

export const InsuranceBlockSchema = SchemaFactory.createForClass(InsuranceBlock);

InsuranceBlockSchema.index({ patientId: 1 });
InsuranceBlockSchema.index({ memberNumber: 1, programCode: 1 });
InsuranceBlockSchema.index({ programCode: 1, isActive: 1 });
InsuranceBlockSchema.index({ patientName: 'text', memberNumber: 'text' });
