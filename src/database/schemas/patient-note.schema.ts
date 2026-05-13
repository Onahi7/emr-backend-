import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'patient_notes' })
export class PatientNote extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true })
  patientId!: Types.ObjectId;

  @Prop({ required: true })
  note!: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  createdBy?: Types.ObjectId;

  createdAt!: Date;
}

export const PatientNoteSchema = SchemaFactory.createForClass(PatientNote);

// Indexes
PatientNoteSchema.index({ patientId: 1 });
