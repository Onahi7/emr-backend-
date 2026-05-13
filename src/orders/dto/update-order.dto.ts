import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  OrderStatusEnum,
  PaymentStatusEnum,
  PaymentMethodEnum,
} from '../../database/schemas/order.schema';

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatusEnum)
  status?: OrderStatusEnum;

  @IsOptional()
  @IsEnum(PaymentStatusEnum)
  paymentStatus?: PaymentStatusEnum;

  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  referredByDoctor?: string;

  @IsOptional()
  @IsString()
  doctorId?: string;
}
