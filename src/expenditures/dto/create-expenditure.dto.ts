import {
  IsString,
  IsNumber,
  IsOptional,
  IsDate,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategoryEnum } from '../../database/schemas/expenditure.schema';

export class CreateExpenditureDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(ExpenseCategoryEnum)
  category: ExpenseCategoryEnum;

  @IsDate()
  @Type(() => Date)
  expenditureDate: Date;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
