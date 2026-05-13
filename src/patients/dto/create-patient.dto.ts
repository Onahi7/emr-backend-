import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsEmail,
  IsDateString,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { AgeUnitEnum, GenderEnum, PatientCategoryEnum } from '../../database/schemas/patient.schema';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(150)
  age: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(54750)
  ageValue?: number;

  @IsEnum(AgeUnitEnum)
  @IsOptional()
  ageUnit?: AgeUnitEnum;

  @IsEnum(GenderEnum)
  @IsNotEmpty()
  gender: GenderEnum;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  occupation?: string;

  @IsString()
  @IsOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  mrn?: string;

  @IsEnum(PatientCategoryEnum)
  @IsOptional()
  patientCategory?: PatientCategoryEnum;

  // Next of kin
  @IsString()
  @IsOptional()
  nextOfKinName?: string;

  @IsString()
  @IsOptional()
  nextOfKinPhone?: string;

  @IsString()
  @IsOptional()
  nextOfKinRelationship?: string;

  // EMR fields
  @IsString()
  @IsOptional()
  bloodType?: string;

  @IsArray()
  @IsOptional()
  allergies?: string[];

  @IsArray()
  @IsOptional()
  chronicConditions?: string[];

  @IsString()
  @IsOptional()
  medicalHistory?: string;

  @IsString()
  @IsOptional()
  currentMedications?: string;

  // Legacy emergency contact
  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @IsString()
  @IsOptional()
  emergencyContactPhone?: string;

  // Insurance / corporate
  @IsString()
  @IsOptional()
  insuranceProvider?: string;

  @IsString()
  @IsOptional()
  insurancePolicyNumber?: string;

  @IsString()
  @IsOptional()
  corporateEmployer?: string;

  @IsString()
  @IsOptional()
  corporateStaffId?: string;
}
