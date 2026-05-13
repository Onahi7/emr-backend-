import { IsEnum, IsNumber, IsOptional, IsString, IsMongoId } from 'class-validator';
import { ConsultationStatusEnum } from '../../database/schemas/consultation.schema';

export class UpdateConsultationDto {
  @IsEnum(ConsultationStatusEnum)
  @IsOptional()
  status?: ConsultationStatusEnum;

  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsString()
  @IsOptional()
  treatment?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  vitalSigns?: {
    bloodPressure?: string;
    temperature?: number;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
  };

  @IsNumber()
  @IsOptional()
  consultationFee?: number;

  @IsMongoId()
  @IsOptional()
  nurseId?: string;
}
