import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { VisitTypeEnum } from '../../database/schemas/visit.schema';

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
}
