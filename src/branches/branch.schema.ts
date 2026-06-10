import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BranchDocument = Branch & Document;

@Schema({ timestamps: true })
export class Branch {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ default: '' })
  address!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  logoUrl!: string;

  /** Optional short motto / tagline shown under the branch name on receipts */
  @Prop({ default: '' })
  tagline!: string;

  /** Branch website URL — shown on receipts */
  @Prop({ default: '' })
  website!: string;

  /** Custom receipt footer text. Falls back to a generic "Thank you" if empty. */
  @Prop({ default: '' })
  footerText!: string;

  /** Operating hours shown on receipts. e.g. "Mon-Sat 8am-8pm" */
  @Prop({ default: '' })
  operatingHours!: string;

  // CAF integration
  @Prop()
  cafBranchId?: string;

  @Prop({ default: 'emr-integration' })
  cafTerminalId!: string;

  // LAB integration
  @Prop()
  labApiKey?: string;

  @Prop()
  labFacilityId?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);
