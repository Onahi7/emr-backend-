import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

class TestPanelItem {
  @Prop({ type: Types.ObjectId, ref: 'TestCatalog', required: true })
  testId: Types.ObjectId;

  @Prop({ required: true })
  testCode: string;

  @Prop({ required: true })
  testName: string;
}

@Schema({ timestamps: true, collection: 'test_panels' })
export class TestPanel extends Document {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  price: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [TestPanelItem], default: [] })
  tests: TestPanelItem[];

  createdAt: Date;
  updatedAt: Date;
}

export const TestPanelSchema = SchemaFactory.createForClass(TestPanel);

// Indexes
TestPanelSchema.index({ code: 1 }, { unique: true });
TestPanelSchema.index({ isActive: 1 });
