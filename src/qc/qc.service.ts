import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QcSample } from '../database/schemas/qc-sample.schema';
import { QcResult } from '../database/schemas/qc-result.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { CreateQcSampleDto } from './dto/create-qc-sample.dto';
import { CreateQcResultDto } from './dto/create-qc-result.dto';

@Injectable()
export class QcService {
  constructor(
    @InjectModel(QcSample.name)
    private qcSampleModel: Model<QcSample>,
    @InjectModel(QcResult.name)
    private qcResultModel: Model<QcResult>,
    @InjectModel(IdSequence.name)
    private idSequenceModel: Model<IdSequence>,
  ) {}

  /**
   * Generate QC sample ID (QC-YYYYMMDD-XXXX)
   */
  private async generateQcSampleId(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const sequenceId = `qc_sample_${datePart}`;

    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      { $inc: { currentValue: 1 }, $setOnInsert: { prefix: 'QC', datePart } },
      { upsert: true, new: true },
    );

    const paddedValue = sequence.currentValue.toString().padStart(4, '0');
    return `QC-${datePart}-${paddedValue}`;
  }

  /**
   * Create QC sample
   */
  async createQcSample(
    createQcSampleDto: CreateQcSampleDto,
    userId: string,
  ): Promise<QcSample> {
    const qcSampleId = await this.generateQcSampleId();

    const qcSample = new this.qcSampleModel({
      ...createQcSampleDto,
      qcSampleId,
      createdBy: new Types.ObjectId(userId),
    });

    return qcSample.save();
  }

  /**
   * Get all QC samples
   */
  async findAllQcSamples(filters: {
    testCode?: string;
    level?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ samples: QcSample[]; total: number }> {
    const query: any = {};

    if (filters.testCode) {
      query.testCode = filters.testCode;
    }
    if (filters.level) {
      query.level = filters.level;
    }
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [samples, total] = await Promise.all([
      this.qcSampleModel
        .find(query)
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.qcSampleModel.countDocuments(query),
    ]);

    return { samples, total };
  }

  /**
   * Get QC sample by ID
   */
  async findQcSampleById(id: string): Promise<QcSample> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid QC sample ID');
    }

    const sample = await this.qcSampleModel
      .findById(id)
      .populate('createdBy', 'fullName email')
      .exec();

    if (!sample) {
      throw new NotFoundException('QC sample not found');
    }

    return sample;
  }

  /**
   * Create QC result
   */
  async createQcResult(
    createQcResultDto: CreateQcResultDto,
    userId: string,
  ): Promise<QcResult> {
    // Validate QC sample exists
    const qcSample = await this.findQcSampleById(createQcResultDto.qcSampleId);

    // Parse value as number for validation
    const value = parseFloat(createQcResultDto.value);
    if (isNaN(value)) {
      throw new BadRequestException('Invalid QC result value');
    }

    // Validate against target range
    const isInRange = this.validateQcRange(
      value,
      qcSample.targetValue || 0,
      qcSample.targetSd ? `${qcSample.targetValue! - qcSample.targetSd}-${qcSample.targetValue! + qcSample.targetSd}` : '',
    );

    const qcResult = new this.qcResultModel({
      ...createQcResultDto,
      qcSampleId: new Types.ObjectId(createQcResultDto.qcSampleId),
      isInRange,
      performedBy: new Types.ObjectId(userId),
      performedAt: new Date(),
    });

    return qcResult.save();
  }

  /**
   * Validate QC result against target range
   */
  private validateQcRange(
    value: number,
    targetValue: number,
    acceptableRange: string,
  ): boolean {
    // Parse acceptable range (e.g., "±2 SD", "±10%")
    if (acceptableRange.includes('±')) {
      const rangeValue = acceptableRange.replace('±', '').trim();
      
      if (rangeValue.includes('SD')) {
        // Standard deviation range
        const sd = parseFloat(rangeValue.replace('SD', '').trim());
        const lowerLimit = targetValue - sd;
        const upperLimit = targetValue + sd;
        return value >= lowerLimit && value <= upperLimit;
      } else if (rangeValue.includes('%')) {
        // Percentage range
        const percentage = parseFloat(rangeValue.replace('%', '').trim());
        const deviation = (targetValue * percentage) / 100;
        const lowerLimit = targetValue - deviation;
        const upperLimit = targetValue + deviation;
        return value >= lowerLimit && value <= upperLimit;
      }
    }

    // Default: assume within 10% of target
    const deviation = targetValue * 0.1;
    return value >= targetValue - deviation && value <= targetValue + deviation;
  }

  /**
   * Get all QC results
   */
  async findAllQcResults(filters: {
    qcSampleId?: string;
    testCode?: string;
    isInRange?: boolean;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ results: QcResult[]; total: number }> {
    const query: any = {};

    if (filters.qcSampleId) {
      query.qcSampleId = new Types.ObjectId(filters.qcSampleId);
    }
    if (filters.testCode) {
      query.testCode = filters.testCode;
    }
    if (filters.isInRange !== undefined) {
      query.isInRange = filters.isInRange;
    }
    if (filters.startDate || filters.endDate) {
      query.performedAt = {};
      if (filters.startDate) {
        query.performedAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.performedAt.$lte = filters.endDate;
      }
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      this.qcResultModel
        .find(query)
        .populate('qcSampleId')
        .populate('performedBy', 'fullName email')
        .sort({ performedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.qcResultModel.countDocuments(query),
    ]);

    return { results, total };
  }

  /**
   * Get out-of-range QC results
   */
  async findOutOfRangeResults(filters: {
    testCode?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ results: QcResult[]; total: number }> {
    return this.findAllQcResults({
      ...filters,
      isInRange: false,
    });
  }

  /**
   * Get QC result by ID
   */
  async findQcResultById(id: string): Promise<QcResult> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid QC result ID');
    }

    const result = await this.qcResultModel
      .findById(id)
      .populate('qcSampleId')
      .populate('performedBy', 'fullName email')
      .exec();

    if (!result) {
      throw new NotFoundException('QC result not found');
    }

    return result;
  }
}
