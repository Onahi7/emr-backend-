import { IsString, IsOptional } from 'class-validator';

export class CreateQcResultDto {
  @IsString()
  qcSampleId: string;

  @IsString()
  testCode: string;

  @IsString()
  value: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
