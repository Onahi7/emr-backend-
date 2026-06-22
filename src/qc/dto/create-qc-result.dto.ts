import { IsMongoId, IsString, IsOptional } from 'class-validator';

export class CreateQcResultDto {
  @IsMongoId()
  qcSampleId: string;

  @IsString()
  testCode: string;

  @IsString()
  value: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
