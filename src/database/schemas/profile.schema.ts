import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'profiles' })
export class Profile extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  fullName: string;

  @Prop()
  department?: string;

  @Prop()
  avatarUrl?: string;

  /** The single branch this user belongs to. Embedded in JWT at login.
   *  Receipts use this to pull the branch letterhead. */
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);

// Indexes
ProfileSchema.index({ email: 1 }, { unique: true });
ProfileSchema.index({ branchId: 1 });
