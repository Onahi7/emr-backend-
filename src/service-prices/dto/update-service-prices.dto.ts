import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ServicePriceUpdateItemDto {
  @IsString()
  @MaxLength(80)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

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
