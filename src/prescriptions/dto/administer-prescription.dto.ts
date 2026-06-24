import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class AdministerPrescriptionDto {
  @IsString()
  @IsNotEmpty()
  medicationName: string;

  @IsString()
  @IsNotEmpty()
  dosage: string;

  @IsString()
  @IsNotEmpty()
  route: string;

  @IsBoolean()
  @IsOptional()
  given?: boolean;

  @IsBoolean()
  @IsOptional()
  refused?: boolean;

  @IsString()
  @IsOptional()
  refusalReason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
