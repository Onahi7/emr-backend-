import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum DoctorTypeEnum {
  GENERAL = 'general',
  SPECIALIST = 'specialist',
}

export enum SpecialtyEnum {
  CARDIOLOGY = 'cardiology',
  DERMATOLOGY = 'dermatology',
  ENDOCRINOLOGY = 'endocrinology',
  GASTROENTEROLOGY = 'gastroenterology',
  GYNECOLOGY = 'gynecology',
  NEUROLOGY = 'neurology',
  ONCOLOGY = 'oncology',
  OPHTHALMOLOGY = 'ophthalmology',
  ORTHOPEDICS = 'orthopedics',
  PEDIATRICS = 'pediatrics',
  PSYCHIATRY = 'psychiatry',
  PULMONOLOGY = 'pulmonology',
  UROLOGY = 'urology',
  ENT = 'ent',
  SURGERY = 'surgery',
  GENERAL_PRACTICE = 'general_practice',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'doctors' })
export class Doctor extends Document {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  facility?: string;

  @Prop({ enum: Object.values(DoctorTypeEnum), default: DoctorTypeEnum.GENERAL })
  doctorType: DoctorTypeEnum;

  @Prop({ enum: Object.values(SpecialtyEnum), default: SpecialtyEnum.GENERAL_PRACTICE })
  specialty: SpecialtyEnum;

  @Prop({ trim: true })
  licenseNumber?: string;

  @Prop({ default: true })
  isActive: boolean;

  /** Link to the user profile that can log in as this doctor.
   *  When set, the doctor's dashboard/queue will be identified by this Doctor record's _id. */
  @Prop({ type: Types.ObjectId, ref: 'Profile', index: true, unique: true, sparse: true })
  userId?: Types.ObjectId;
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);
DoctorSchema.index({ fullName: 1 });
DoctorSchema.index({ doctorType: 1, specialty: 1 });
