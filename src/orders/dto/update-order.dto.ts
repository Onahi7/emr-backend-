import {
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  OrderStatusEnum,
  PaymentStatusEnum,
  PaymentMethodEnum,
  PriorityEnum,
  DiscountTypeEnum,
} from '../../database/schemas/order.schema';
import { OrderTestDto } from './create-order.dto';

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

  /** Replace the order's test list (only allowed before payment) */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Order must have at least one test' })
  @ValidateNested({ each: true })
  @Type(() => OrderTestDto)
  tests?: OrderTestDto[];

  @IsOptional()
  @IsEnum(PriorityEnum)
  priority?: PriorityEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountTypeEnum)
  discountType?: DiscountTypeEnum;
}
