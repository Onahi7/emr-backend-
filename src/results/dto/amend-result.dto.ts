import { IsString } from 'class-validator';

export class AmendResultDto {
  @IsString()
  newValue: string;

  @IsString()
  reason: string;
}
