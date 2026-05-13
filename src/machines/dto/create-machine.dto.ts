import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ProtocolEnum } from '../../database/schemas/machine.schema';

export class CreateMachineDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  manufacturer!: string;

  @IsString()
  @IsNotEmpty()
  modelName!: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsEnum(ProtocolEnum)
  @IsNotEmpty()
  protocol!: ProtocolEnum;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  testsSupported?: string[];
}
