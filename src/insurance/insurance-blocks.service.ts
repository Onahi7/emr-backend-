import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InsuranceBlock, InsuranceBlockDocument, BlockReasonEnum, BLOCK_REASON_LABELS } from '../database/schemas/insurance-block.schema';

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
  }, addedBy?: string): Promise<InsuranceBlock> {
    // Check for existing active block on same patient/program
    if (dto.patientId) {
      const existing = await this.blockModel.findOne({
        patientId: new Types.ObjectId(dto.patientId),
        programCode: dto.programCode,
        isActive: true,
      });
      if (existing) {
        throw new BadRequestException('Patient already has an active block for this insurance program');
      }
    }

    // Also check by member number
    if (dto.memberNumber) {
      const existingByMember = await this.blockModel.findOne({
        memberNumber: dto.memberNumber,
        programCode: dto.programCode,
        isActive: true,
      });
      if (existingByMember) {
        throw new BadRequestException('Member number already has an active block for this insurance program');
      }
    }

    return this.blockModel.create({
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

  async findById(id: string): Promise<InsuranceBlock> {
    const block = await this.blockModel
      .findById(id)
      .populate('patientId', 'patientId firstName lastName phone insurance')
      .populate('addedBy', 'fullName')
      .lean()
      .exec();
    if (!block) throw new NotFoundException('Block record not found');
    return block;
  }

  async checkBlocked(patientId?: string, memberNumber?: string, programCode?: string): Promise<{
    blocked: boolean;
    block?: InsuranceBlock;
    reason?: string;
    reasonLabel?: string;
  }> {
    const query: any = { isActive: true };
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

  async deactivate(id: string): Promise<InsuranceBlock> {
    const block = await this.blockModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    ).lean().exec();
    if (!block) throw new NotFoundException('Block record not found');
    this.logger.log(`Block ${id} deactivated`);
    return block;
  }

  async reactivate(id: string): Promise<InsuranceBlock> {
    const block = await this.blockModel.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true },
    ).lean().exec();
    if (!block) throw new NotFoundException('Block record not found');
    this.logger.log(`Block ${id} reactivated`);
    return block;
  }

  async remove(id: string): Promise<void> {
    const result = await this.blockModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Block record not found');
    this.logger.log(`Block ${id} permanently deleted`);
  }

  async getStats(): Promise<any> {
    const [activeCount, totalCount, byProgram, byReason] = await Promise.all([
      this.blockModel.countDocuments({ isActive: true }),
      this.blockModel.countDocuments(),
      this.blockModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$programCode', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.blockModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return { activeCount, totalCount, byProgram, byReason };
  }
}
