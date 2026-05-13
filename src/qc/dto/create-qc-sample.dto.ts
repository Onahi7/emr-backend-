import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export class CreateQcSampleDto {
  @IsString()
  testCode: string;

  @IsString()
  testName: string;

  @IsEnum(['level_1', 'level_2', 'level_3'])
  level: string;

  @IsString()
  lotNumber: string;

  @IsNumber()
  targetValue: number;

  @IsString()
  acceptableRange: string;

  @IsString()
  unit: string;

  @IsString()
  @IsOptional()
  expiryDate?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
