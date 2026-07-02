import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsEmail, IsNotEmpty, MinLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRoleEnum } from '../../database/schemas/user-role.schema';

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
  cafBaseUrl?: string;

  @IsString()
  @IsOptional()
  cafUsername?: string;

  @IsString()
  @IsOptional()
  cafPassword?: string;

  @IsBoolean()
  @IsOptional()
  cafEnabled?: boolean;

  @IsString()
  @IsOptional()
  cafBranchId?: string;

  @IsString()
  @IsOptional()
  cafTerminalId?: string;

  @IsString()
  @IsOptional()
  lisBaseUrl?: string;

  @IsBoolean()
  @IsOptional()
  lisEnabled?: boolean;

  @IsString()
  @IsOptional()
  labApiKey?: string;

  @IsString()
  @IsOptional()
  labFacilityId?: string;

  @IsBoolean()
  @IsOptional()
  provisionCaf?: boolean;
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
  cafBaseUrl?: string;

  @IsString()
  @IsOptional()
  cafUsername?: string;

  @IsString()
  @IsOptional()
  cafPassword?: string;

  @IsBoolean()
  @IsOptional()
  cafEnabled?: boolean;

  @IsString()
  @IsOptional()
  cafBranchId?: string;

  @IsString()
  @IsOptional()
  cafTerminalId?: string;

  @IsString()
  @IsOptional()
  lisBaseUrl?: string;

  @IsBoolean()
  @IsOptional()
  lisEnabled?: boolean;

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

class BatchUserItemDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsEnum(UserRoleEnum)
  role!: UserRoleEnum;
}

export class BatchCreateUsersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchUserItemDto)
  users!: BatchUserItemDto[];
}

export class ProvisionCafBranchDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;
}
