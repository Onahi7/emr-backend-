import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

export function requireBranchId(branchId?: string | Types.ObjectId | null): string {
  const value = branchId?.toString().trim();
  if (!value) {
    throw new ForbiddenException('A branch must be selected for this operation');
  }
  if (!Types.ObjectId.isValid(value)) {
    throw new BadRequestException('Invalid branch ID');
  }
  return value;
}

export function branchFilter(branchId?: string | Types.ObjectId | null): { branchId: Types.ObjectId } {
  return { branchId: new Types.ObjectId(requireBranchId(branchId)) };
}

export function assertEntityBranch(
  entity: { branchId?: string | Types.ObjectId | null } | null | undefined,
  branchId?: string | Types.ObjectId | null,
  entityName = 'Record',
): void {
  if (!entity) throw new NotFoundException(`${entityName} not found`);
  const required = requireBranchId(branchId);
  if (!entity.branchId || entity.branchId.toString() !== required) {
    throw new NotFoundException(`${entityName} not found`);
  }
}

export function withBranch<T extends Record<string, unknown>>(
  query: T,
  branchId?: string | Types.ObjectId | null,
): T & { branchId: Types.ObjectId } {
  return { ...query, ...branchFilter(branchId) };
}
