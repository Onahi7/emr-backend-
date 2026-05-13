import { IsString, IsNotEmpty } from 'class-validator';

export class RejectSampleDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
