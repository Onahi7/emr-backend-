import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ResultFlagEnum } from '../../database/schemas/result.schema';

export class UpdateResultDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsOptional()
  @IsEnum(ResultFlagEnum)
  flag?: ResultFlagEnum;

  @IsOptional()
  @IsString()
  comments?: string;
}
