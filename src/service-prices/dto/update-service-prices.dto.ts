import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ServicePriceCodeEnum } from '../../database/schemas/service-price.schema';

export class ServicePriceUpdateItemDto {
  @IsEnum(ServicePriceCodeEnum)
  code!: ServicePriceCodeEnum;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateServicePricesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicePriceUpdateItemDto)
  prices!: ServicePriceUpdateItemDto[];
}
