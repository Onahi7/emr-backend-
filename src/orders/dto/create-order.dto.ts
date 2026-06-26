import {
  IsString,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PriorityEnum,
  DiscountTypeEnum,
  PaymentMethodEnum,
  OrderTypeEnum,
} from '../../database/schemas/order.schema';

export class OrderTestDto {
  @IsOptional()
  @IsString()
  testId?: string;

  @IsString()
  testCode: string;

  @IsString()
  testName: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  panelCode?: string;

  @IsOptional()
  @IsString()
  panelName?: string;
}

export class InitialPaymentDto {
  @IsEnum(PaymentMethodEnum)
  paymentMethod: PaymentMethodEnum;

  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreateOrderDto {
  @IsMongoId()
  patientId: string;

  @IsOptional()
  @IsMongoId()
  visitId?: string;

  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @IsOptional()
  @IsString()
  referredByDoctor?: string;

  @IsOptional()
  @IsMongoId()
  doctorId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderTestDto)
  tests: OrderTestDto[];

  @IsEnum(PriorityEnum)
  priority: PriorityEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountTypeEnum)
  discountType?: DiscountTypeEnum;

  /** Legacy single-method support — use initialPayments[] for split payments */
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialPaymentAmount?: number;

  /** Split payment rows — when provided, takes precedence over paymentMethod */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialPaymentDto)
  initialPayments?: InitialPaymentDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
