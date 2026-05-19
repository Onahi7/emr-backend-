import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { AppointmentStatusEnum } from '../../database/schemas/appointment.schema';

export class CreateAppointmentDto {
  @IsString()
  patientId: string;

  @IsString()
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
