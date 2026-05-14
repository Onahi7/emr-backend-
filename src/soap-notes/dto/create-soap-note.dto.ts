import { IsNotEmpty, IsEnum, IsString, IsOptional, IsMongoId } from 'class-validator';
import { SoapNoteTypeEnum } from '../../database/schemas/soap-note.schema';

export class CreateSoapNoteDto {
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
  @IsOptional()
  doctorId?: string;

  @IsEnum(SoapNoteTypeEnum)
  @IsOptional()
  noteType?: SoapNoteTypeEnum;

  // Subjective
  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsString()
  @IsOptional()
  historyPresentIllness?: string;

  @IsString()
  @IsOptional()
  reviewOfSystems?: string;

  // Objective
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

  // Assessment
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsOptional()
  differentialDiagnosis?: string[];

  // Plan
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
