import { IsString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { VisitTypeEnum } from '../../database/schemas/visit.schema';

export class CreateVisitDto {
  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
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
  @IsString()
  registeredBy?: string;
}
