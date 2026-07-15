import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum ClaimItemDtoType {
  LAB_ORDER = 'lab_order',
  PRESCRIPTION = 'prescription',
  PROCEDURE = 'procedure',
  CONSULTATION = 'consultation',
  OTHER = 'other',
}

export class ClaimItemDto {
  @IsEnum(ClaimItemDtoType)
  itemType: ClaimItemDtoType;

  @IsString()
  itemId: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsBoolean()
  coveredByInsurance?: boolean;
}

export class CreateInsuranceClaimDto {
  @IsString()
  visitId: string;

  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsString()
  programCode: string;

  @IsOptional()
  @IsString()
  subEntityCode?: string;

  @IsOptional()
  @IsString()
  memberNumber?: string;

  @IsOptional()
  @IsString()
  memberName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimItemDto)
  items: ClaimItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClaimStatusDto {
  @IsEnum(['draft', 'submitted', 'approved', 'partially_approved', 'rejected', 'paid'])
  status: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  verificationReference?: string;
}

export class AddClaimItemDto {
  @IsEnum(ClaimItemDtoType)
  itemType: ClaimItemDtoType;

  @IsString()
  itemId: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsBoolean()
  coveredByInsurance?: boolean;
}

export class MarkOrderItemsDto {
  @IsArray()
  @Type(() => OrderItemInsuranceDto)
  items: OrderItemInsuranceDto[];
}

export class MarkOrderInsuranceDto {
  @IsString()
  orderId: string;

  /** Amount authorized/covered by insurance. Omit to cover the full balance. */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  insuranceAmount?: number;

  @IsOptional()
  @IsString()
  verificationReference?: string;

  @IsOptional()
  @IsString()
  verificationNotes?: string;
}

export class OrderItemInsuranceDto {
  @IsString()
  orderId: string;

  @IsBoolean()
  coveredByInsurance: boolean;
}
