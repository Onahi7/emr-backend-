import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { ResultFlagEnum } from '../../database/schemas/result.schema';

export class CreateResultDto {
  @IsMongoId()
  orderId: string;

  @IsOptional()
  @IsMongoId()
  orderTestId?: string;

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

  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsOptional()
  @IsString()
  menstrualPhase?: string;

  @IsOptional()
  @IsString()
  allReferenceRanges?: string;

  @IsOptional()
  @IsEnum(ResultFlagEnum)
  flag?: ResultFlagEnum;

  @IsOptional()
  @IsString()
  comments?: string;
}
