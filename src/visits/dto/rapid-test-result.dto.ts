import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RapidTestResultDto {
  @IsEnum(['malaria', 'typhoid'])
  testType: 'malaria' | 'typhoid';

  @IsEnum(['positive', 'negative'])
  result: 'positive' | 'negative';

  /** Parasite count per microliter — malaria only (used in severe malaria protocols) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  parasiteCount?: number;

  /** Antigen tested — p.f, pan, p.v for malaria; TOG, IgM, IgG for typhoid */
  @IsOptional()
  @IsString()
  antigen?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
