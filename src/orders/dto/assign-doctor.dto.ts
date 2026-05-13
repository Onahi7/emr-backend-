import { IsOptional, IsString } from 'class-validator';

export class AssignDoctorDto {
  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  referredByDoctor?: string;
}
