import { ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportMetadataDto } from './report-metadata.dto';
import { PatientInfoDto } from './patient-info.dto';
import { OrderInfoDto } from './order-info.dto';
import { ResultCategoryDto } from './result-category.dto';
import { PanelInterpretationDto } from './panel-interpretation.dto';
import { VerificationInfoDto } from './verification-info.dto';
import { LaboratoryInfoDto } from './laboratory-info.dto';

export class LabResultReportDto {
  @ValidateNested()
  @Type(() => ReportMetadataDto)
  reportMetadata: ReportMetadataDto;

  @ValidateNested()
  @Type(() => PatientInfoDto)
  patientInfo: PatientInfoDto;

  @ValidateNested()
  @Type(() => OrderInfoDto)
  orderInfo: OrderInfoDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResultCategoryDto)
  resultsByCategory: ResultCategoryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PanelInterpretationDto)
  panelInterpretations: PanelInterpretationDto[];

  @ValidateNested()
  @Type(() => VerificationInfoDto)
  verificationInfo: VerificationInfoDto;

  @ValidateNested()
  @Type(() => LaboratoryInfoDto)
  laboratoryInfo: LaboratoryInfoDto;
}
