import { IsOptional, IsString, IsIn, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Per-item dispense record from the receptionist.
 * Each prescription item can be dispensed in either "individual" (count base units) or
 * "pack" (count sell units, e.g. 1 box of 30 tablets) mode.
 */
export class DispenseItemDto {
  @IsString()
  medicationId: string;

  /**
   * "individual" — receptionist dispenses N base units (e.g. 6 ampules)
   * "pack" — receptionist dispenses N sell units of a specific pack (e.g. 1 box of 30)
   */
  @IsIn(['individual', 'pack'])
  dispenseMode: 'individual' | 'pack';

  /**
   * For "pack" mode — index into medication.packSizes. -1 / null for "individual" mode.
   */
  @IsOptional()
  @IsNumber()
  packSizeIndex?: number;

  /**
   * How many sell units to dispense.
   * For "individual" mode this is the number of base units (e.g. 6 ampules).
   * For "pack" mode this is the number of packs (e.g. 1 box).
   */
  @IsNumber()
  @Min(0)
  sellUnits: number;

  /**
   * Manual reception costing for catalogs that do not yet have clean base units.
   * Example: doctor writes "BD 5/7"; receptionist charges 1 "card" at Le 20.
   */
  @IsOptional()
  @IsString()
  manualSellUnitLabel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  manualPricePerSellUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  manualBaseUnitsPerSellUnit?: number;

  /**
   * Optional substitute medication. If set, the original prescribed medication is
   * not dispensed — the substitute is. Both are recorded on the prescription item.
   */
  @IsOptional()
  @IsString()
  substituteMedicationId?: string;

  @IsOptional()
  @IsString()
  substituteNote?: string;
}

export class DispensePrescriptionDto {
  /**
   * Pharmacist's dispensing notes — stored on the prescription, not printed on label.
   * e.g. "Counselled patient on storage requirements"
   * e.g. "Substituted brand — same generic, same strength"
   */
  @IsOptional()
  @IsString()
  dispensingNotes?: string;

  /**
   * Payment method used by the patient — forwarded to CAF for the sale record.
   */
  @IsOptional()
  @IsIn(['cash', 'card', 'orange_money', 'africell_money', 'qmoney', 'bank_transfer', 'insurance', 'credit'])
  paymentMethod?: string;

  /**
   * Per-item dispense records. If omitted, the original prescribed quantity is used
   * (legacy / backward-compatible behavior).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispenseItemDto)
  items?: DispenseItemDto[];
}

