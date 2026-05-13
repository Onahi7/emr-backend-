import { IsEnum, IsString, IsOptional, IsMongoId } from 'class-validator';
import { SoapNoteTypeEnum } from '../../database/schemas/soap-note.schema';

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
  vitalSigns?: {
    bloodPressure?: string;
    temperature?: number;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
    bmi?: number;
  };

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
