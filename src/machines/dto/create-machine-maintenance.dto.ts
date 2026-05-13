import { IsString, IsEnum, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';

export class CreateMachineMaintenanceDto {
  @IsString()
  @IsOptional()
  machineId?: string;

  @IsEnum(['preventive', 'corrective', 'calibration', 'validation'])
  maintenanceType: string;

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  performedBy?: string;

  @IsDateString()
  performedAt: string;

  @IsDateString()
  @IsOptional()
  nextDueDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  cost?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
