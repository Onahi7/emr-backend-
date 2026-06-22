import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class AssignDoctorDto {
  @IsOptional()
  @IsMongoId()
  doctorId?: string;

  @IsOptional()
  @IsString()
  referredByDoctor?: string;
}
