import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { GenderEnum } from '../../database/schemas/patient.schema';

export class PatientInfoDto {
  @IsString()
  patientId: string;

  @IsString()
  fullName: string;

  @IsNumber()
  age: number;

  @IsOptional()
  @IsNumber()
  ageValue?: number;

  @IsOptional()
  @IsString()
  ageUnit?: string;

  @IsEnum(GenderEnum)
  gender: GenderEnum;

  @IsOptional()
  @IsString()
  mrn?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
