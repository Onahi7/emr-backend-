import { IsNotEmpty, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class PayTreatmentPlanDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string; // cash, orange_money, afrimoney, wallet

  @IsString()
  @IsOptional()
  notes?: string;
}
