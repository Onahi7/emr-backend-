import {
  IsArray,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrescriptionItemDto } from './create-prescription.dto';

export class UpdatePrescriptionDto {
  /** Replace the prescription's medication list (only allowed before payment) */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Prescription must contain at least one medication item' })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items?: PrescriptionItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;
}
