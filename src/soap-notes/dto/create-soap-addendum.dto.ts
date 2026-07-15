import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSoapAddendumDto {
  @IsString()
  @IsNotEmpty()
  text: string;
}
