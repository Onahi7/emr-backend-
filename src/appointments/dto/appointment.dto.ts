import { IsString, IsOptional, IsEnum, IsDateString, IsMongoId } from 'class-validator';
import { AppointmentStatusEnum } from '../../database/schemas/appointment.schema';

export class CreateAppointmentDto {
  @IsMongoId()
  patientId: string;

  @IsMongoId()
  doctorId: string;

  @IsDateString()
  date: string;

  @IsString()
  time: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsEnum(AppointmentStatusEnum)
  status?: AppointmentStatusEnum;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  cancellationReason?: string;
}
