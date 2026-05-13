import { IsString, IsOptional, IsMongoId } from 'class-validator';

export class CreatePanelInterpretationDto {
  @IsMongoId()
  orderId: string;

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
