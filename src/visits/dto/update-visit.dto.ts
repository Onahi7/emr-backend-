import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { VisitStatusEnum, VisitTypeEnum } from '../../database/schemas/visit.schema';

export class UpdateVisitDto {
  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsEnum(VisitStatusEnum)
  status?: VisitStatusEnum;

  @IsOptional()
  @IsEnum(VisitTypeEnum)
  visitType?: VisitTypeEnum;

  @IsOptional()
  @IsBoolean()
  consultationPaid?: boolean;

  @IsOptional()
  @IsString()
  consultationOrderId?: string;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Vitals
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsString()
  bloodPressure?: string;

  @IsOptional()
  @IsNumber()
  heartRate?: number;

  @IsOptional()
  @IsNumber()
  respiratoryRate?: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  oxygenSaturation?: number;

  // SOAP Notes
  @IsOptional()
  @IsString()
  subjectiveNotes?: string;

  @IsOptional()
  @IsString()
  objectiveNotes?: string;

  @IsOptional()
  @IsString()
  assessmentNotes?: string;

  @IsOptional()
  @IsString()
  planNotes?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  // Triage
  @IsOptional()
  @IsString()
  triagePriority?: string;

  @IsOptional()
  @IsString()
  triageNotes?: string;

  // Referral
  @IsOptional()
  @IsString()
  referredToSpecialistId?: string;

  @IsOptional()
  @IsString()
  referralReason?: string;

  @IsOptional()
  @IsString()
  referralNotes?: string;
}
