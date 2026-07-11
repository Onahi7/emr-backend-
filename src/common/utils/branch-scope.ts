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

export function branchFilter(branchId?: string | Types.ObjectId | null): { $or: Array<{ branchId: Types.ObjectId | string }> } {
  const value = requireBranchId(branchId);
  return { $or: [{ branchId: new Types.ObjectId(value) }, { branchId: value }] };
}

export function branchFilterOptional(branchId?: string | Types.ObjectId | null): { $or: Array<{ branchId: Types.ObjectId | string }> } | Record<string, never> {
  if (!branchId?.toString().trim()) return {};
  return branchFilter(branchId);
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
): T & { $or: Array<{ branchId: Types.ObjectId | string }> } {
  return { ...query, ...branchFilter(branchId) };
}
