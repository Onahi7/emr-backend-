import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class StockReceiptDto {
  @IsMongoId()
  medicationId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiryDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockAdjustmentDto {
  @IsMongoId()
  medicationId: string;

  @IsNumber()
  quantity: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RemoveExpiredStockDto {
  @IsMongoId()
  medicationId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  reason: string;
}

export class CreateSupplierDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
