import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum StockMovementTypeEnum {
  RECEIPT = 'receipt',              // Stock received from supplier
  DISPENSE = 'dispense',            // Stock dispensed to patient
  ADJUSTMENT = 'adjustment',        // Manual adjustment (correction)
  RETURN = 'return',                // Returned to supplier
  EXPIRED = 'expired',              // Removed due to expiry
  DAMAGED = 'damaged',              // Removed due to damage
  TRANSFER = 'transfer',            // Inter-facility transfer
}

@Schema({ timestamps: true, collection: 'stock_movements' })
export class StockMovement extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Medication', required: true })
  medicationId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(StockMovementTypeEnum) })
  movementType: StockMovementTypeEnum;

  @Prop({ required: true })
  quantity: number; // Positive for inflows, negative for outflows

  @Prop()
  batchNumber?: string;

  @Prop()
  expiryDate?: Date;

  @Prop()
  unitCost?: number;

  @Prop()
  totalCost?: number;

  @Prop({ type: Types.ObjectId, ref: 'Supplier' })
  supplierId?: Types.ObjectId;

  @Prop()
  supplierName?: string;

  @Prop()
  invoiceNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'Prescription' })
  prescriptionId?: Types.ObjectId;

  @Prop()
  reason?: string;

  @Prop()
  notes?: string;

  @Prop({ required: true })
  stockBefore: number;

  @Prop({ required: true })
  stockAfter: number;

  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true })
  performedBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ medicationId: 1, createdAt: -1 });
StockMovementSchema.index({ movementType: 1 });
StockMovementSchema.index({ createdAt: -1 });
