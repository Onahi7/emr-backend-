import { Type } from 'class-transformer';
import { IsEnum, IsString, IsOptional, IsMongoId, ValidateNested } from 'class-validator';
import { SoapNoteTypeEnum } from '../../database/schemas/soap-note.schema';
import { VitalSignsDto } from '../../common/dto/vital-signs.dto';

export class UpdateSoapNoteDto {
  @IsEnum(SoapNoteTypeEnum)
  @IsOptional()
  noteType?: SoapNoteTypeEnum;

  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsString()
  @IsOptional()
  historyPresentIllness?: string;

  @IsString()
  @IsOptional()
  reviewOfSystems?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VitalSignsDto)
  vitalSigns?: VitalSignsDto;

  @IsString()
  @IsOptional()
  physicalExamination?: string;

  @IsString()
  @IsOptional()
  laboratoryResults?: string;

  @IsString()
  @IsOptional()
  radiologyResults?: string;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsOptional()
  differentialDiagnosis?: string[];

  @IsString()
  @IsOptional()
  treatmentPlan?: string;

  @IsString()
  @IsOptional()
  medications?: string;

  @IsString()
  @IsOptional()
  followUpInstructions?: string;

  @IsString()
  @IsOptional()
  patientEducation?: string;

  @IsMongoId()
  @IsOptional()
  nurseId?: string;
}
