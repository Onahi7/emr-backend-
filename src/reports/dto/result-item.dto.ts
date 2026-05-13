import { IsString, IsDate, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ResultFlagEnum } from '../../database/schemas/result.schema';

export class ResultItemDto {
  @IsString()
  testCode: string;

  @IsString()
  testName: string;

  @IsOptional()
  @IsString()
  panelCode?: string;

  @IsOptional()
  @IsString()
  panelName?: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsEnum(ResultFlagEnum)
  flag: ResultFlagEnum;

  @IsDate()
  resultedAt: Date;

  @IsOptional()
  @IsString()
  comments?: string;

  @IsBoolean()
  isAmended: boolean;

  @IsOptional()
  @IsString()
  amendmentReason?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsString()
  menstrualPhase?: string;

  @IsOptional()
  @IsString()
  allReferenceRanges?: string;
}
