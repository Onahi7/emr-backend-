import {
  IsNotEmpty,
  IsMongoId,
  IsArray,
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TreatmentPlanItemTypeEnum } from '../../database/schemas/treatment-plan.schema';

export class TreatmentPlanItemDto {
  @IsEnum(TreatmentPlanItemTypeEnum)
  @IsNotEmpty()
  type: TreatmentPlanItemTypeEnum;

  // Drug/IV fields
  @IsOptional()
  @IsMongoId()
  medicationId?: string;

  @IsOptional()
  @IsString()
  medicationName?: string;

  @IsOptional()
  @IsString()
  strengthPerDose?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dosesPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  route?: string;

  // Lab fields
  @IsOptional()
  @IsString()
  testCode?: string;

  @IsOptional()
  @IsString()
  testName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  testPrice?: number;

  @IsOptional()
  @IsString()
  testId?: string;

  // Procedure/Other fields
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTreatmentPlanDto {
  @IsMongoId()
  @IsNotEmpty()
  patientId: string;

  @IsMongoId()
  @IsOptional()
  visitId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Treatment plan must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => TreatmentPlanItemDto)
  items: TreatmentPlanItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
