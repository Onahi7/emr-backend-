import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Panel Interpretation Schema
 * 
 * Stores interpretive messages for test panels (e.g., FBC, LFT)
 * These are clinical interpretations added by lab technicians
 * after reviewing the panel results.
 */
@Schema({ timestamps: true, collection: 'panel_interpretations' })
export class PanelInterpretation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ required: true })
  panelCode: string; // e.g., "FBC", "LFT", "RFT"

  @Prop({ required: true })
  panelName: string; // e.g., "Full Blood Count"

  @Prop()
  wbcMessage?: string; // White Blood Cell interpretation

  @Prop()
  rbcMessage?: string; // Red Blood Cell interpretation

  @Prop()
  pltMessage?: string; // Platelet interpretation

  @Prop()
  generalMessage?: string; // General panel interpretation (for non-FBC panels)

  @Prop()
  interpretation?: string; // AI-generated interpretation text

  @Prop()
  aiProvider?: string; // Provider used: 'groq', 'openai', etc.

  @Prop()
  aiGeneratedAt?: Date; // When AI interpretation was generated

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  enteredBy?: Types.ObjectId;

  @Prop()
  enteredAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const PanelInterpretationSchema = SchemaFactory.createForClass(PanelInterpretation);

// Indexes
PanelInterpretationSchema.index({ orderId: 1 });
PanelInterpretationSchema.index({ panelCode: 1 });
// Unique compound index - one interpretation per panel per order
PanelInterpretationSchema.index({ orderId: 1, panelCode: 1 }, { unique: true });
