import { IsNotEmpty, IsMongoId, IsEnum, IsArray, IsString, IsOptional, IsNumber } from 'class-validator';
import { PrescriptionStatusEnum } from '../../database/schemas/prescription.schema';

export class PrescriptionItemDto {
  @IsMongoId()
  @IsNotEmpty()
  medicationId: string;

  @IsString()
  @IsNotEmpty()
  medicationName: string;

  @IsString()
  @IsNotEmpty()
  dosage: string;

  @IsString()
  @IsNotEmpty()
  frequency: string;

  @IsString()
  @IsNotEmpty()
  duration: string;

  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @IsString()
  @IsOptional()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsMongoId()
  @IsNotEmpty()
  patientId: string;

  @IsMongoId()
  @IsOptional()
  consultationId?: string;

  @IsMongoId()
  @IsOptional()
  visitId?: string;

  @IsMongoId()
  @IsNotEmpty()
  doctorId: string;

  @IsArray()
  @IsNotEmpty()
  items: PrescriptionItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  totalAmount?: number;
}
