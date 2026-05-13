import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { MedicationCategoryEnum } from '../../database/schemas/medication.schema';

export class UpdateMedicationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  genericName?: string;

  @IsEnum(MedicationCategoryEnum)
  @IsOptional()
  category?: MedicationCategoryEnum;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  dosageForm?: string;

  @IsString()
  @IsOptional()
  strength?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsNumber()
  @IsOptional()
  stockQuantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @IsOptional()
  reorderLevel?: number;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsOptional()
  expiryDate?: Date;

  @IsOptional()
  isActive?: boolean;
}
