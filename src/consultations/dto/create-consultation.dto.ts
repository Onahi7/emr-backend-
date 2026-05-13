import { IsNotEmpty, IsEnum, IsNumber, IsOptional, IsString, IsMongoId } from 'class-validator';
import { ConsultationTypeEnum } from '../../database/schemas/consultation.schema';

export class CreateConsultationDto {
  @IsMongoId()
  @IsNotEmpty()
  patientId: string;

  @IsMongoId()
  @IsNotEmpty()
  doctorId: string;

  @IsEnum(ConsultationTypeEnum)
  @IsNotEmpty()
  consultationType: ConsultationTypeEnum;

  @IsNumber()
  @IsNotEmpty()
  consultationFee: number;

  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsMongoId()
  @IsOptional()
  nurseId?: string;
}
