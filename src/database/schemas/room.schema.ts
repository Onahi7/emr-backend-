import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum RoomStatusEnum {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  MAINTENANCE = 'maintenance',
  RESERVED = 'reserved',
}

export enum RoomTypeEnum {
  CONSULTATION = 'consultation',
  TREATMENT = 'treatment',
  PROCEDURE = 'procedure',
  EMERGENCY = 'emergency',
  OBSERVATION = 'observation',
  TRIAGE = 'triage',
}

@Schema({ timestamps: true, collection: 'rooms' })
export class Room extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: Object.values(RoomTypeEnum) })
  roomType: RoomTypeEnum;

  @Prop({ required: true, enum: Object.values(RoomStatusEnum), default: RoomStatusEnum.AVAILABLE })
  status: RoomStatusEnum;

  @Prop({ type: Types.ObjectId, ref: 'Visit' })
  currentVisitId?: Types.ObjectId;

  @Prop()
  currentPatientName?: string;

  @Prop({ default: 1 })
  capacity: number;

  @Prop()
  floor?: string;

  @Prop()
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ branchId: 1, name: 1 }, { unique: true });
RoomSchema.index({ branchId: 1, roomType: 1, status: 1 });
RoomSchema.index({ branchId: 1, status: 1 });
