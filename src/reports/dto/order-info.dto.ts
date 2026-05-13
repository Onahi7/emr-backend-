import { IsString, IsDate, IsOptional } from 'class-validator';

export class OrderInfoDto {
  @IsString()
  orderNumber: string;

  @IsDate()
  orderDate: Date;

  @IsOptional()
  @IsDate()
  collectedAt?: Date;

  @IsOptional()
  @IsDate()
  receivedAt?: Date;

  @IsOptional()
  @IsDate()
  reportedAt?: Date;

  @IsString()
  priority: string;

  @IsOptional()
  @IsString()
  orderingPhysician?: string;
}
