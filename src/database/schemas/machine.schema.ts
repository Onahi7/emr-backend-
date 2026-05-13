import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ProtocolEnum {
  HL7 = 'HL7',
  ASTM = 'ASTM',
  FHIR = 'FHIR',
  LIS2_A2 = 'LIS2_A2',
}

export enum MachineStatusEnum {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
  PROCESSING = 'processing',
}

@Schema({ timestamps: true, collection: 'machines' })
export class Machine extends Document {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  manufacturer!: string;

  @Prop({ required: true })
  modelName!: string;

  @Prop()
  serialNumber?: string;

  @Prop({ required: true, enum: Object.values(ProtocolEnum) })
  protocol!: ProtocolEnum;

  @Prop({
    required: true,
    enum: Object.values(MachineStatusEnum),
    default: MachineStatusEnum.OFFLINE,
  })
  status!: MachineStatusEnum;

  @Prop()
  ipAddress?: string;

  @Prop()
  port?: number;

  @Prop({ type: [String] })
  testsSupported?: string[];

  @Prop()
  lastCommunication?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MachineSchema = SchemaFactory.createForClass(Machine);

// Indexes
MachineSchema.index({ status: 1 });
MachineSchema.index({ protocol: 1 });
