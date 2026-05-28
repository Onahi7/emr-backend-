import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Branch, BranchDocument } from './branch.schema';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  async create(dto: CreateBranchDto): Promise<BranchDocument> {
    const existing = await this.branchModel.findOne({ code: dto.code });
    if (existing) {
      throw new ConflictException(`Branch with code "${dto.code}" already exists`);
    }
    return this.branchModel.create(dto);
  }

  async findAll(): Promise<BranchDocument[]> {
    return this.branchModel.find({ isActive: true }).sort({ name: 1 }).exec();
  }

  async findById(id: string): Promise<BranchDocument> {
    const branch = await this.branchModel.findById(id).exec();
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto): Promise<BranchDocument> {
    const branch = await this.findById(id);
    Object.assign(branch, dto);
    return branch.save();
  }

  async getBranchConfig(branchId: string): Promise<{
    cafBranchId: string;
    cafTerminalId: string;
    labApiKey: string;
    labFacilityId: string;
  }> {
    const branch = await this.findById(branchId);
    return {
      cafBranchId: branch.cafBranchId || '',
      cafTerminalId: branch.cafTerminalId || 'emr-integration',
      labApiKey: branch.labApiKey || '',
      labFacilityId: branch.labFacilityId || '',
    };
  }
}
