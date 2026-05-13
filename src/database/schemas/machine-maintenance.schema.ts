import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum MaintenanceTypeEnum {
  PREVENTIVE = 'preventive',
  CORRECTIVE = 'corrective',
  CALIBRATION = 'calibration',
  VALIDATION = 'validation',
}

@Schema({ timestamps: true, collection: 'machine_maintenance' })
export class MachineMaintenance extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Machine', required: true })
  machineId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(MaintenanceTypeEnum) })
  maintenanceType!: MaintenanceTypeEnum;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  performedBy?: Types.ObjectId;

  @Prop({ required: true })
  performedAt!: Date;

  @Prop()
  nextDueDate?: Date;

  @Prop()
  cost?: number;

  @Prop()
  notes?: string;

  createdAt!: Date;
}

export const MachineMaintenanceSchema =
  SchemaFactory.createForClass(MachineMaintenance);

// Indexes
MachineMaintenanceSchema.index({ machineId: 1 });
MachineMaintenanceSchema.index({ nextDueDate: 1 });
