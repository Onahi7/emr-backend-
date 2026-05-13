import { IsString, IsDate, IsOptional } from 'class-validator';

export class VerificationInfoDto {
  @IsOptional()
  @IsString()
  performedBy?: string;

  @IsOptional()
  @IsString()
  verifiedBy?: string;

  @IsOptional()
  @IsDate()
  verifiedAt?: Date;
}
