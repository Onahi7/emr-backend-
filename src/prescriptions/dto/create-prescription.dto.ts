import {
  IsNotEmpty,
  IsMongoId,
  IsArray,
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RouteOfAdministrationEnum } from '../../database/schemas/prescription.schema';

export class PrescriptionItemDto {
  @IsMongoId()
  @IsNotEmpty()
  medicationId: string;

  @IsString()
  @IsNotEmpty()
  medicationName: string;

  /**
   * Amount per dose — e.g. "500mg", "1 tablet", "5ml"
   */
  @IsString()
  @IsNotEmpty()
  dosage: string;

  /**
   * How often — e.g. "3 times daily", "every 8 hours", "once at bedtime"
   */
  @IsString()
  @IsNotEmpty()
  frequency: string;

  /**
   * How long — e.g. "7 days", "2 weeks", "until finished"
   */
  @IsString()
  @IsNotEmpty()
  duration: string;

  /**
   * Total units to dispense (calculated from dosage × frequency × duration)
   */
  @IsNumber()
  @Min(1)
  quantity: number;

  /**
   * Route of administration — defaults to oral if not specified
   */
  @IsOptional()
  @IsEnum(RouteOfAdministrationEnum)
  route?: RouteOfAdministrationEnum;

  /**
   * Patient-facing directions printed on the dispensing label.
   * The doctor writes this in plain language the patient can understand.
   * e.g. "Take 1 tablet by mouth 3 times daily with food for 7 days"
   * e.g. "Apply a thin layer to the affected area twice daily"
   * e.g. "Instil 2 drops into the right eye every 6 hours"
   * If not provided, the pharmacist generates it from dosage + frequency + duration + route.
   */
  @IsOptional()
  @IsString()
  instructions?: string;

  /**
   * Internal note for the pharmacist only — NOT printed on the patient label.
   * e.g. "Counsel patient on photosensitivity risk"
   * e.g. "Refrigerate after opening, discard after 14 days"
   * e.g. "Check renal function before dispensing"
   */
  @IsOptional()
  @IsString()
  pharmacistNote?: string;
}

export class CreatePrescriptionDto {
  @IsMongoId()
  @IsNotEmpty()
  patientId: string;

  @IsMongoId()
  @IsOptional()
  consultationId?: string;

  @IsMongoId()
  @IsOptional()
  visitId?: string;

  @IsMongoId()
  @IsNotEmpty()
  doctorId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Prescription must contain at least one medication item' })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  /**
   * General notes from the doctor — visible to pharmacist and patient
   * e.g. "Complete the full course even if symptoms improve"
   * e.g. "Return if rash develops"
   */
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;
}
