import { IsNotEmpty, IsNumber, IsString, IsOptional, Min, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentSplitDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string; // cash, orange_money, afrimoney, wallet
}

export class PayTreatmentPlanDto {
  // Single payment — backward compatible
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  amount?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string; // cash, orange_money, afrimoney, wallet

  // Split payment — new
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments?: PaymentSplitDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
