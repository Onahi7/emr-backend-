import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Expenditure } from '../database/schemas/expenditure.schema';
import { CreateExpenditureDto } from './dto/create-expenditure.dto';

@Injectable()
export class ExpendituresService {
  private readonly logger = new Logger(ExpendituresService.name);

  constructor(
    @InjectModel(Expenditure.name)
    private expenditureModel: Model<Expenditure>,
  ) {}

  async create(createDto: CreateExpenditureDto, userId: string) {
    const expenditure = new this.expenditureModel({
      ...createDto,
      recordedBy: new Types.ObjectId(userId),
    });

    await expenditure.save();
    this.logger.log(`Expenditure created: ${createDto.description} - Le ${createDto.amount}`);

    return this.findOne(expenditure._id.toString());
  }

  async findAll(filters?: {
    startDate?: string;
    endDate?: string;
    category?: string;
  }) {
    const query: any = {};

    if (filters?.startDate || filters?.endDate) {
      query.expenditureDate = {};
      if (filters.startDate) {
        query.expenditureDate.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.expenditureDate.$lte = new Date(filters.endDate);
      }
    }

    if (filters?.category && filters.category !== 'all') {
      query.category = filters.category;
    }

    return this.expenditureModel
      .find(query)
      .populate('recordedBy', 'fullName email')
      .populate('flaggedBy', 'fullName email')
      .sort({ expenditureDate: -1 })
      .exec();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Expenditure with ID ${id} not found`);
    }

    const expenditure = await this.expenditureModel
      .findById(id)
      .populate('recordedBy', 'fullName email')
      .populate('flaggedBy', 'fullName email')
      .exec();

    if (!expenditure) {
      throw new NotFoundException(`Expenditure with ID ${id} not found`);
    }

    return expenditure;
  }

  async update(id: string, updateData: Partial<CreateExpenditureDto>) {
    const expenditure = await this.expenditureModel.findById(id).exec();
    if (!expenditure) {
      throw new NotFoundException(`Expenditure with ID ${id} not found`);
    }

    Object.assign(expenditure, updateData);
    await expenditure.save();

    return this.findOne(id);
  }

  async delete(id: string) {
    const result = await this.expenditureModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Expenditure with ID ${id} not found`);
    }
    this.logger.log(`Expenditure deleted: ${id}`);
  }

  async flag(id: string, userId: string, reason: string) {
    const expenditure = await this.expenditureModel.findById(id).exec();
    if (!expenditure) {
      throw new NotFoundException(`Expenditure with ID ${id} not found`);
    }

    expenditure.flagged = true;
    expenditure.flagReason = reason;
    expenditure.flaggedBy = new Types.ObjectId(userId);
    expenditure.flaggedAt = new Date();
    await expenditure.save();

    this.logger.log(`Expenditure flagged: ${id} by ${userId} reason: ${reason}`);
    return this.findOne(id);
  }

  async unflag(id: string) {
    const expenditure = await this.expenditureModel.findById(id).exec();
    if (!expenditure) {
      throw new NotFoundException(`Expenditure with ID ${id} not found`);
    }

    expenditure.flagged = false;
    expenditure.flagReason = undefined;
    expenditure.flaggedBy = undefined;
    expenditure.flaggedAt = undefined;
    await expenditure.save();

    this.logger.log(`Expenditure unflagged: ${id}`);
    return this.findOne(id);
  }

  async getSummary(startDate?: string, endDate?: string) {
    const match: any = {};

    if (startDate || endDate) {
      match.expenditureDate = {};
      if (startDate) match.expenditureDate.$gte = new Date(startDate);
      if (endDate) match.expenditureDate.$lte = new Date(endDate);
    }

    const [byCategory, totals, dailyTotals] = await Promise.all([
      // Breakdown by category
      this.expenditureModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),

      // Overall totals
      this.expenditureModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            flaggedAmount: {
              $sum: { $cond: ['$flagged', '$amount', 0] },
            },
            flaggedCount: {
              $sum: { $cond: ['$flagged', 1, 0] },
            },
          },
        },
      ]),

      // Daily breakdown
      this.expenditureModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$expenditureDate' },
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);

    const summary = totals[0] || {
      totalAmount: 0,
      count: 0,
      flaggedAmount: 0,
      flaggedCount: 0,
    };

    return {
      ...summary,
      byCategory,
      dailyTotals: dailyTotals.map((d) => ({
        date: d._id,
        total: d.total,
        count: d.count,
      })),
    };
  }
}
