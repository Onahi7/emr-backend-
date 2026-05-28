import { IsOptional, IsString, IsIn } from 'class-validator';

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
}
