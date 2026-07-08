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
  @IsString()
  @IsNotEmpty()
  medicationId: string;

  @IsString()
  @IsNotEmpty()
  medicationName: string;

  // === Structured regimen (REQUIRED) ===
  /**
   * Strength per dose — e.g. "500mg", "1 tablet", "2 ampules"
   */
  @IsString()
  @IsNotEmpty()
  strengthPerDose: string;

  /**
   * How many doses per day. e.g. 3 for "3x daily", 4 for "every 6 hours"
   */
  @IsNumber()
  @Min(1)
  dosesPerDay: number;

  /**
   * Duration in days. e.g. 7 for "1 week", 3 for "3 days"
   */
  @IsNumber()
  @Min(1)
  durationDays: number;

  /**
   * Total quantity in BASE UNITS. Backend computes this from the above three
   * fields, but the doctor can override for unusual regimens.
   * For "Augmentin 625mg 2x daily for 7 days" this would be 14 tablets.
   */
  @IsNumber()
  @Min(1)
  quantity: number;

  // === Free-text overrides (OPTIONAL) ===
  /** Legacy dosage string. Usually auto-generated from strengthPerDose. */
  @IsOptional()
  @IsString()
  dosage?: string;

  /** Legacy frequency string. Usually auto-generated from dosesPerDay. */
  @IsOptional()
  @IsString()
  frequency?: string;

  /** Legacy duration string. Usually auto-generated from durationDays. */
  @IsOptional()
  @IsString()
  duration?: string;

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
  @IsOptional()
  doctorId?: string;

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
