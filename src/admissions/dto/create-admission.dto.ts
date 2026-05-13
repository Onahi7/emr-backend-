import { IsArray, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { WardTypeEnum } from '../../database/schemas/admission.schema';

export class CreateAdmissionDto {
  @IsMongoId()
  patientId: string;

  @IsOptional()
  @IsMongoId()
  visitId?: string;

  @IsOptional()
  @IsMongoId()
  doctorId?: string;

  @IsOptional()
  @IsMongoId()
  primaryNurseId?: string;

  @IsOptional()
  @IsEnum(WardTypeEnum)
  wardType?: WardTypeEnum;

  @IsOptional()
  @IsString()
  bedNumber?: string;

  @IsString()
  admissionReason: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryRestrictions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  precautions?: string[];

  @IsOptional()
  @IsEnum(['full_code', 'dnr', 'dni'])
  codeStatus?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
