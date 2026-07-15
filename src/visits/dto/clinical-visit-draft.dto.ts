import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ProblemListItemDto } from './update-visit.dto';

export class ClinicalVisitDraftDto {
  @IsOptional() @IsString() chiefComplaint?: string;
  @IsOptional() @IsNumber() temperature?: number;
  @IsOptional() @IsString() bloodPressure?: string;
  @IsOptional() @IsNumber() heartRate?: number;
  @IsOptional() @IsNumber() respiratoryRate?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() oxygenSaturation?: number;
  @IsOptional() @IsString() subjectiveNotes?: string;
  @IsOptional() @IsString() objectiveNotes?: string;
  @IsOptional() @IsString() assessmentNotes?: string;
  @IsOptional() @IsString() planNotes?: string;
  @IsOptional() @IsString() diagnosis?: string;

  @IsOptional()
  @IsIn(['esi_1_emergency', 'esi_2_urgent', 'esi_3_urgent', 'esi_4_less_urgent', 'esi_5_non_urgent'])
  triageOverridePriority?: string;

  @IsOptional() @IsString() doctorTriageNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProblemListItemDto)
  problemList?: ProblemListItemDto[];
}

export class CompleteVisitDto extends ClinicalVisitDraftDto {}
