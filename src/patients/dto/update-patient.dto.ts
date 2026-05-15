import { PartialType } from '@nestjs/mapped-types';
import { CreatePatientDto } from './create-patient.dto';
import { IsOptional, IsString, IsEmail, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AllergyDetailDto {
  @IsString()
  allergen: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  reaction?: string;

  @IsOptional()
  @IsString()
  diagnosedAt?: string;
}

export class MedicationItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  prescribedBy?: string;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  stoppedAt?: string;

  @IsOptional()
  active?: boolean;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergyDetailDto)
  allergyDetails?: Array<{ allergen: string; severity?: string; reaction?: string; diagnosedAt?: string }>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medicationList?: Array<{ name: string; dosage?: string; frequency?: string; prescribedBy?: string; startedAt?: string; stoppedAt?: string; active: boolean }>;
}
