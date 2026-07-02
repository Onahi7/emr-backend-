import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ServicePrice,
  ServicePriceCodeEnum,
  ServicePriceDocument,
} from '../database/schemas/service-price.schema';
import { UpdateServicePricesDto } from './dto/update-service-prices.dto';

type ServicePriceConfig = {
  code: string;
  label: string;
  category: string;
  amount: number;
  description: string;
  isCustom?: boolean;
};

export const DEFAULT_SERVICE_PRICES: ServicePriceConfig[] = [
  {
    code: ServicePriceCodeEnum.NORMAL_CONSULTATION,
    label: 'Normal Consultation',
    category: 'Visit',
    amount: 150,
    description: 'Standard general-practice visit',
  },
  {
    code: ServicePriceCodeEnum.SPECIALIST_CONSULTATION,
    label: 'Specialist Consultation',
    category: 'Visit',
    amount: 250,
    description: 'Direct booking to a named specialist',
  },
  {
    code: ServicePriceCodeEnum.OBSERVATION_4H,
    label: 'Observation (4 hours)',
    category: 'Visit',
    amount: 100,
    description: 'Short-stay monitoring in observation',
  },
  {
    code: ServicePriceCodeEnum.PROCEDURE,
    label: 'Procedure Booking',
    category: 'Visit',
    amount: 50,
    description: 'Procedure room booking fee',
  },
  {
    code: ServicePriceCodeEnum.RAPID_MALARIA,
    label: 'Rapid Malaria Test',
    category: 'Rapid Test',
    amount: 50,
    description: 'Reception-requested rapid malaria screening',
  },
  {
    code: ServicePriceCodeEnum.RAPID_TYPHOID,
    label: 'Rapid Typhoid Test',
    category: 'Rapid Test',
    amount: 50,
    description: 'Reception-requested rapid typhoid screening',
  },
  {
    code: ServicePriceCodeEnum.OXYGEN_HOUR,
    label: 'Oxygen Therapy / Hour',
    category: 'Admission',
    amount: 200,
    description: 'Hourly oxygen therapy charge',
  },
];

@Injectable()
export class ServicePricesService {
  constructor(
    @InjectModel(ServicePrice.name) private servicePriceModel: Model<ServicePriceDocument>,
  ) {}

  private normalizeCode(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private sortPrices<T extends { category?: string; label?: string; code?: string }>(prices: T[]) {
    return prices.sort((a, b) => {
      const categoryCompare = String(a.category || '').localeCompare(String(b.category || ''));
      if (categoryCompare !== 0) return categoryCompare;
      return String(a.label || a.code || '').localeCompare(String(b.label || b.code || ''));
    });
  }

  async getEffectivePrices(branchId?: string) {
    if (!branchId || !Types.ObjectId.isValid(branchId)) {
      return this.sortPrices(DEFAULT_SERVICE_PRICES.map((price) => ({
        ...price,
        isCustom: false,
        isActive: true,
        branchId: null,
      })));
    }

    const docs = await this.servicePriceModel.find({ branchId: new Types.ObjectId(branchId) }).lean().exec();
    const byCode = new Map(docs.map((doc) => [doc.code, doc]));

    const builtIns = DEFAULT_SERVICE_PRICES.map((defaultPrice) => {
      const saved = byCode.get(defaultPrice.code);
      return {
        ...defaultPrice,
        _id: saved?._id,
        branchId,
        amount: saved?.amount ?? defaultPrice.amount,
        description: saved?.description ?? defaultPrice.description,
        isCustom: false,
        isActive: saved?.isActive ?? true,
      };
    });

    const defaultCodes = new Set(DEFAULT_SERVICE_PRICES.map((price) => price.code));
    const customPrices = docs
      .filter((doc) => !defaultCodes.has(doc.code))
      .map((doc) => ({
        _id: doc._id,
        branchId,
        code: doc.code,
        label: doc.label,
        category: doc.category,
        amount: doc.amount,
        description: doc.description || '',
        isCustom: true,
        isActive: doc.isActive ?? true,
      }));

    return this.sortPrices([...builtIns, ...customPrices]);
  }

  async getPrice(branchId: string | undefined, code: ServicePriceCodeEnum): Promise<number> {
    const prices = await this.getEffectivePrices(branchId);
    const found = prices.find((price) => price.code === code);
    return Number(found?.amount ?? DEFAULT_SERVICE_PRICES.find((price) => price.code === code)?.amount ?? 0);
  }

  async updateBranchPrices(branchId: string, dto: UpdateServicePricesDto) {
    if (!Types.ObjectId.isValid(branchId)) {
      throw new BadRequestException('Invalid branch ID');
    }

    const branchObjectId = new Types.ObjectId(branchId);
    const defaultsByCode = new Map(DEFAULT_SERVICE_PRICES.map((price) => [price.code, price]));

    for (const item of dto.prices) {
      const code = this.normalizeCode(item.code || item.label || '');
      if (!code) throw new BadRequestException('Service code is required');
      if (code.length > 80) throw new BadRequestException(`Service code is too long: ${code}`);

      const defaultPrice = defaultsByCode.get(code);
      const isCustom = !defaultPrice;
      const label = (defaultPrice?.label || item.label || '').trim();
      const category = (defaultPrice?.category || item.category || '').trim();

      if (isCustom && (!label || !category)) {
        throw new BadRequestException(`Custom service ${code} requires a label and category`);
      }

      await this.servicePriceModel.findOneAndUpdate(
        { branchId: branchObjectId, code },
        {
          $set: {
            branchId: branchObjectId,
            code,
            label,
            category,
            amount: Math.round(Number(item.amount || 0) * 100) / 100,
            description: (item.description ?? defaultPrice?.description ?? '').trim(),
            isCustom,
            isActive: item.isActive ?? true,
          },
        },
        { upsert: true, new: true },
      ).exec();
    }

    return this.getEffectivePrices(branchId);
  }
}
