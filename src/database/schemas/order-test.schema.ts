import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'order_tests' })
export class OrderTest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TestCatalog' })
  testId?: Types.ObjectId;

  @Prop({ required: true })
  testCode: string;

  @Prop({ required: true })
  testName: string;

  @Prop()
  panelCode?: string;

  @Prop()
  panelName?: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Machine' })
  machineId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Sample' })
  sampleId?: Types.ObjectId;

  createdAt: Date;
}

export const OrderTestSchema = SchemaFactory.createForClass(OrderTest);

// Indexes
OrderTestSchema.index({ orderId: 1 });
OrderTestSchema.index({ testCode: 1 });
