import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsMongoId, ValidateNested } from 'class-validator';
import { ConsultationStatusEnum } from '../../database/schemas/consultation.schema';
import { VitalSignsDto } from '../../common/dto/vital-signs.dto';

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
  @ValidateNested()
  @Type(() => VitalSignsDto)
  vitalSigns?: VitalSignsDto;

  @IsNumber()
  @IsOptional()
  consultationFee?: number;

  @IsMongoId()
  @IsOptional()
  nurseId?: string;
}
