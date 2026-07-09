import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InsuranceProgram, InsuranceProgramDocument } from '../database/schemas/insurance.schema';
import { InsuranceSubEntity, InsuranceSubEntityDocument } from '../database/schemas/insurance.schema';
import { CreateInsuranceProgramDto, UpdateInsuranceProgramDto } from './dto/create-insurance-program.dto';
import { CreateInsuranceSubEntityDto, UpdateInsuranceSubEntityDto } from './dto/create-insurance-sub-entity.dto';

@Injectable()
export class InsuranceService {
  constructor(
    @InjectModel(InsuranceProgram.name) private programModel: Model<InsuranceProgramDocument>,
    @InjectModel(InsuranceSubEntity.name) private subEntityModel: Model<InsuranceSubEntityDocument>,
  ) {}

  // ── Programs ──

  async findAllPrograms(): Promise<any[]> {
    return this.programModel.find({ isActive: true }).sort({ name: 1 }).lean();
  }

  async findProgramById(id: string): Promise<any> {
    const program = await this.programModel.findById(id).lean();
    if (!program) throw new NotFoundException('Insurance program not found');
    return program;
  }

  async createProgram(dto: CreateInsuranceProgramDto): Promise<any> {
    const existing = await this.programModel.findOne({ code: dto.code.toUpperCase() });
    if (existing) throw new ConflictException(`Program with code "${dto.code}" already exists`);
    return this.programModel.create({ ...dto, code: dto.code.toUpperCase() });
  }

  async updateProgram(id: string, dto: UpdateInsuranceProgramDto): Promise<any> {
    const program = await this.programModel.findByIdAndUpdate(id, dto, { new: true });
    if (!program) throw new NotFoundException('Insurance program not found');
    return program;
  }

  async removeProgram(id: string): Promise<void> {
    const result = await this.programModel.findByIdAndUpdate(id, { isActive: false });
    if (!result) throw new NotFoundException('Insurance program not found');
  }

  // ── Sub-Entities ──

  async findSubEntitiesByProgram(programId: string): Promise<any[]> {
    return this.subEntityModel.find({ programId, isActive: true }).sort({ name: 1 }).lean();
  }

  async findSubEntityById(id: string): Promise<any> {
    const sub = await this.subEntityModel.findById(id).lean();
    if (!sub) throw new NotFoundException('Insurance sub-entity not found');
    return sub;
  }

  async createSubEntity(programId: string, dto: CreateInsuranceSubEntityDto): Promise<any> {
    const program = await this.programModel.findById(programId);
    if (!program) throw new NotFoundException('Insurance program not found');

    const existing = await this.subEntityModel.findOne({
      programId: new Types.ObjectId(programId),
      code: dto.code.toUpperCase(),
    });
    if (existing) throw new ConflictException(`Sub-entity with code "${dto.code}" already exists for this program`);

    return this.subEntityModel.create({
      ...dto,
      programId: new Types.ObjectId(programId),
      code: dto.code.toUpperCase(),
    });
  }

  async updateSubEntity(id: string, dto: UpdateInsuranceSubEntityDto): Promise<any> {
    const sub = await this.subEntityModel.findByIdAndUpdate(id, dto, { new: true });
    if (!sub) throw new NotFoundException('Insurance sub-entity not found');
    return sub;
  }

  async removeSubEntity(id: string): Promise<void> {
    const result = await this.subEntityModel.findByIdAndUpdate(id, { isActive: false });
    if (!result) throw new NotFoundException('Insurance sub-entity not found');
  }

  // ── Lookup (for dropdowns) ──

  async getLookup(): Promise<any[]> {
    const programs = await this.programModel.find({ isActive: true }).sort({ name: 1 }).lean();
    const result = [];
    for (const prog of programs) {
      const subs = await this.subEntityModel.find({ programId: prog._id, isActive: true }).sort({ name: 1 }).lean();
      result.push({
        ...prog,
        subEntities: subs,
      });
    }
    return result;
  }
}
