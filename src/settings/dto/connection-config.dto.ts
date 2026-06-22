import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ConnectionConfigDto {
  @IsOptional()
  @IsString()
  localUrl?: string;

  @IsOptional()
  @IsString()
  cloudUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  localTimeout?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  cloudTimeout?: number;
}
