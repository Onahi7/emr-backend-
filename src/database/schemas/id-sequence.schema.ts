import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'id_sequences', _id: false })
export class IdSequence {
  @Prop({ required: true, type: String })
  _id: string; // e.g., 'patient_id', 'order_number', 'sample_id'

  @Prop()
  prefix?: string;

  @Prop()
  datePart?: string; // YYYYMMDD

  @Prop({ required: true, default: 0 })
  currentValue: number;
}

export const IdSequenceSchema = SchemaFactory.createForClass(IdSequence);
