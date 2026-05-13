import { IsNotEmpty, IsEnum, IsNumber, IsString, IsOptional, IsMongoId } from 'class-validator';
import { PaymentTypeEnum } from '../../database/schemas/payment.schema';

export class CreatePaymentDto {
  @IsEnum(PaymentTypeEnum)
  @IsNotEmpty()
  paymentType: PaymentTypeEnum;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @IsMongoId()
  @IsOptional()
  visitId?: string;

  @IsMongoId()
  @IsOptional()
  orderId?: string;

  @IsMongoId()
  @IsOptional()
  consultationId?: string;

  @IsMongoId()
  @IsOptional()
  prescriptionId?: string;

  @IsMongoId()
  @IsNotEmpty()
  receivedBy: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
