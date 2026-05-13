import { IsString, IsOptional } from 'class-validator';

export class PanelInterpretationDto {
  @IsString()
  panelCode: string;

  @IsString()
  panelName: string;

  @IsOptional()
  @IsString()
  wbcMessage?: string;

  @IsOptional()
  @IsString()
  rbcMessage?: string;

  @IsOptional()
  @IsString()
  pltMessage?: string;

  @IsOptional()
  @IsString()
  generalMessage?: string;

  @IsOptional()
  @IsString()
  interpretation?: string;

  @IsOptional()
  @IsString()
  aiProvider?: string;

  @IsOptional()
  @IsString()
  aiGeneratedAt?: string;
}
