import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { TestCategoryEnum } from '../../database/schemas/test-catalog.schema';
import { SampleTypeEnum } from '../../database/schemas/sample.schema';

class ReferenceRangeItemDto {
  @IsString()
  @IsOptional()
  ageGroup?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  ageMin?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  ageMax?: number;

  @IsEnum(['M', 'F', 'all'])
  @IsOptional()
  gender?: 'M' | 'F' | 'all';

  @IsBoolean()
  @IsOptional()
  pregnancy?: boolean;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  range: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  criticalLow?: string;

  @IsString()
  @IsOptional()
  criticalHigh?: string;
}

export class CreateTestDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsEnum(TestCategoryEnum)
  category: TestCategoryEnum;

  @IsEnum(SampleTypeEnum)
  sampleType: SampleTypeEnum;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  referenceRange?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceRangeItemDto)
  @IsOptional()
  referenceRanges?: ReferenceRangeItemDto[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  turnaroundTime?: number;

  @IsString()
  @IsOptional()
  machineId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  panelCode?: string;

  @IsString()
  @IsOptional()
  panelName?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  linkedTests?: string[];
}
