import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { DoctorTypeEnum, SpecialtyEnum } from '../../database/schemas/doctor.schema';

export class CreateDoctorDto {
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  facility?: string;

  @IsOptional()
  @IsEnum(DoctorTypeEnum)
  doctorType?: DoctorTypeEnum;

  @IsOptional()
  @IsEnum(SpecialtyEnum)
  specialty?: SpecialtyEnum;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
