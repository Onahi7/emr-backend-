import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SampleStatusEnum } from '../../database/schemas/sample.schema';

export class UpdateSampleDto {
  @IsEnum(SampleStatusEnum)
  @IsOptional()
  status?: SampleStatusEnum;

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}
