import { IsArray, IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { VisitTypeEnum, VisitServiceTypeEnum } from '../../database/schemas/visit.schema';

export class CreateVisitDto {
  @IsMongoId()
  patientId: string;

  @IsOptional()
  @IsMongoId()
  doctorId?: string;

  @IsOptional()
  @IsEnum(VisitTypeEnum)
  visitType?: VisitTypeEnum;

  @IsNumber()
  @Min(0)
  consultationFee: number;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsMongoId()
  registeredBy?: string;

  // Quick vitals from reception
  @IsOptional()
  @IsNumber()
  temperature?: number;

  /** Billable service picked at reception — drives specialist/procedure/rapid-test workflow */
  @IsOptional()
  @IsEnum(VisitServiceTypeEnum)
  serviceType?: VisitServiceTypeEnum;

  /** When serviceType is specialist_consultation, the Profile of the receiving specialist */
  @IsOptional()
  @IsMongoId()
  specialistId?: string;

  /** When serviceType is procedure, the name of the procedure (e.g. "Wound dressing", "Suturing") */
  @IsOptional()
  @IsString()
  procedureType?: string;

  /** Rapid tests requested upfront */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rapidTestsRequested?: ('malaria' | 'typhoid')[];

  /** When true, insurance is blocked for this patient — force self-pay */
  @IsOptional()
  @IsBoolean()
  selfPayOverride?: boolean;
}
