import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InsuranceBlock, InsuranceBlockDocument, BlockReasonEnum, BLOCK_REASON_LABELS } from '../database/schemas/insurance-block.schema';
import { requireBranchId, withBranch } from '../common/utils/branch-scope';

@Injectable()
export class InsuranceBlocksService {
  private readonly logger = new Logger(InsuranceBlocksService.name);

  constructor(
    @InjectModel(InsuranceBlock.name) private blockModel: Model<InsuranceBlockDocument>,
  ) {}

  async create(dto: {
    patientId?: string;
    patientName?: string;
    memberNumber?: string;
    programCode: string;
    subEntityCode?: string;
    reason: BlockReasonEnum;
    reasonDetail?: string;
    effectiveDate?: string;
    notes?: string;
  }, addedBy?: string, branchId?: string): Promise<InsuranceBlock> {
    const requiredBranchId = requireBranchId(branchId);
    // Check for existing active block on same patient/program
    if (dto.patientId) {
      const existing = await this.blockModel.findOne(withBranch({
        patientId: new Types.ObjectId(dto.patientId),
        programCode: dto.programCode,
        isActive: true,
      }, requiredBranchId));
      if (existing) {
        throw new BadRequestException('Patient already has an active block for this insurance program');
      }
    }

    // Also check by member number
    if (dto.memberNumber) {
      const existingByMember = await this.blockModel.findOne(withBranch({
        memberNumber: dto.memberNumber,
        programCode: dto.programCode,
        isActive: true,
      }, requiredBranchId));
      if (existingByMember) {
        throw new BadRequestException('Member number already has an active block for this insurance program');
      }
    }

    return this.blockModel.create({
      branchId: requiredBranchId,
      patientId: dto.patientId ? new Types.ObjectId(dto.patientId) : undefined,
      patientName: dto.patientName,
      memberNumber: dto.memberNumber,
      programCode: dto.programCode,
      subEntityCode: dto.subEntityCode,
      reason: dto.reason,
      reasonDetail: dto.reasonDetail,
      effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : new Date(),
      isActive: true,
      addedBy: addedBy ? new Types.ObjectId(addedBy) : undefined,
      notes: dto.notes,
    });
  }

  async findAll(filters?: {
    programCode?: string;
    isActive?: boolean;
    search?: string;
    branchId?: string;
  }): Promise<InsuranceBlock[]> {
    const query: any = {};
    Object.assign(query, withBranch({}, filters?.branchId));

    if (filters?.programCode) query.programCode = filters.programCode;
    if (filters?.isActive !== undefined) query.isActive = filters.isActive;
    if (filters?.search) {
      query.$or = [
        { patientName: { $regex: filters.search, $options: 'i' } },
        { memberNumber: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return this.blockModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName phone')
      .populate('addedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findById(id: string, branchId?: string): Promise<InsuranceBlock> {
    const block = await this.blockModel
      .findOne(withBranch({ _id: id }, branchId))
      .populate('patientId', 'patientId firstName lastName phone insurance')
      .populate('addedBy', 'fullName')
      .lean()
      .exec();
    if (!block) throw new NotFoundException('Block record not found');
    return block;
  }

  async checkBlocked(patientId?: string, memberNumber?: string, programCode?: string, branchId?: string): Promise<{
    blocked: boolean;
    block?: InsuranceBlock;
    reason?: string;
    reasonLabel?: string;
  }> {
    const query: any = withBranch({ isActive: true }, branchId);
    if (programCode) query.programCode = programCode;

    if (patientId) {
      query.patientId = new Types.ObjectId(patientId);
    } else if (memberNumber) {
      query.memberNumber = memberNumber;
    } else {
      return { blocked: false };
    }

    const block = await this.blockModel.findOne(query).lean().exec();
    if (!block) return { blocked: false };

    return {
      blocked: true,
      block,
      reason: block.reasonDetail || block.reason,
      reasonLabel: BLOCK_REASON_LABELS[block.reason] || block.reason,
    };
  }

  async deactivate(id: string, branchId?: string): Promise<InsuranceBlock> {
    const block = await this.blockModel.findOneAndUpdate(
      withBranch({ _id: id }, branchId),
      { isActive: false },
      { new: true },
    ).lean().exec();
    if (!block) throw new NotFoundException('Block record not found');
    this.logger.log(`Block ${id} deactivated`);
    return block;
  }

  async reactivate(id: string, branchId?: string): Promise<InsuranceBlock> {
    const block = await this.blockModel.findOneAndUpdate(
      withBranch({ _id: id }, branchId),
      { isActive: true },
      { new: true },
    ).lean().exec();
    if (!block) throw new NotFoundException('Block record not found');
    this.logger.log(`Block ${id} reactivated`);
    return block;
  }

  async remove(id: string, branchId?: string): Promise<void> {
    const result = await this.blockModel.findOneAndDelete(withBranch({ _id: id }, branchId)).exec();
    if (!result) throw new NotFoundException('Block record not found');
    this.logger.log(`Block ${id} permanently deleted`);
  }

  async getStats(branchId?: string): Promise<any> {
    const scope = withBranch({}, branchId);
    const [activeCount, totalCount, byProgram, byReason] = await Promise.all([
      this.blockModel.countDocuments({ ...scope, isActive: true }),
      this.blockModel.countDocuments(scope),
      this.blockModel.aggregate([
        { $match: { ...scope, isActive: true } },
        { $group: { _id: '$programCode', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.blockModel.aggregate([
        { $match: { ...scope, isActive: true } },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return { activeCount, totalCount, byProgram, byReason };
  }
}
