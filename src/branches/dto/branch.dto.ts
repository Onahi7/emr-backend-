import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  tagline?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsString()
  @IsOptional()
  operatingHours?: string;

  @IsString()
  @IsOptional()
  cafBranchId?: string;

  @IsString()
  @IsOptional()
  cafTerminalId?: string;

  @IsString()
  @IsOptional()
  labApiKey?: string;

  @IsString()
  @IsOptional()
  labFacilityId?: string;
}

export class UpdateBranchDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  tagline?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsString()
  @IsOptional()
  operatingHours?: string;

  @IsString()
  @IsOptional()
  cafBranchId?: string;

  @IsString()
  @IsOptional()
  cafTerminalId?: string;

  @IsString()
  @IsOptional()
  labApiKey?: string;

  @IsString()
  @IsOptional()
  labFacilityId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

