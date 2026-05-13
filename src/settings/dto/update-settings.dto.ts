import { IsString, IsObject, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  key: string;

  @IsObject()
  value: any;

  @IsOptional()
  @IsString()
  description?: string;
}
