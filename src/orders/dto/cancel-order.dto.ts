import { IsString, IsNotEmpty } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
