import { IsNotEmpty, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { PriorityLevelEnum } from '../../database/schemas/queue.schema';

export class CreateQueueDto {
  @IsMongoId()
  @IsNotEmpty()
  patientId: string;

  @IsMongoId()
  @IsOptional()
  visitId?: string;

  @IsMongoId()
  @IsOptional()
  consultationId?: string;

  @IsEnum(PriorityLevelEnum)
  @IsOptional()
  priority?: PriorityLevelEnum;

  @IsString()
  @IsOptional()
  notes?: string;
}
