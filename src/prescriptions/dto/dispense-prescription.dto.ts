import { IsOptional, IsString } from 'class-validator';

export class DispensePrescriptionDto {
  /**
   * Pharmacist's dispensing notes — stored on the prescription, not printed on label.
   * e.g. "Counselled patient on storage requirements"
   * e.g. "Substituted brand — same generic, same strength"
   */
  @IsOptional()
  @IsString()
  dispensingNotes?: string;
}
