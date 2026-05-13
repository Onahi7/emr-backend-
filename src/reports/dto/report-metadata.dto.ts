import { IsString, IsDate } from 'class-validator';

export class ReportMetadataDto {
  @IsString()
  reportId: string;

  @IsDate()
  generatedAt: Date;

  @IsString()
  generatedBy: string;
}
