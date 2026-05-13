import { IsDate, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReconciliationDto {
  @IsDate()
  @Type(() => Date)
  reconciliationDate: Date;

  @IsNumber()
  @Min(0)
  actualCash: number;

  @IsNumber()
  @Min(0)
  actualOrangeMoney: number;

  @IsNumber()
  @Min(0)
  actualAfrimoney: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
