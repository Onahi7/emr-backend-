import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested, IsDateString, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { VisitStatusEnum, VisitTypeEnum } from '../../database/schemas/visit.schema';

export class ProblemListItemDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  notedAt?: string;
}

export class UpdateVisitDto {
  @IsOptional()
  @IsMongoId()
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
  @IsMongoId()
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

  // Triage
  @IsOptional()
  @IsString()
  triagePriority?: string;

  @IsOptional()
  @IsString()
  triageNotes?: string;

  // Referral
  @IsOptional()
  @IsMongoId()
  referredToSpecialistId?: string;

  @IsOptional()
  @IsString()
  referralReason?: string;

  @IsOptional()
  @IsString()
  referralNotes?: string;

  // Problem list
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProblemListItemDto)
  problemList?: Array<{ code?: string; name: string; status?: string; notedAt?: string }>;

  // Follow-up
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  followUpNotes?: string;
}
