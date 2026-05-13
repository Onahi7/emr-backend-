import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewReconciliationDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
