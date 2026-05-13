import { IsString, IsNotEmpty } from 'class-validator';

export class CreatePatientNoteDto {
  @IsString()
  @IsNotEmpty()
  note: string;
}
