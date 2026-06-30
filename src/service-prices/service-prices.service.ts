import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ServicePrice,
  ServicePriceCodeEnum,
  ServicePriceDocument,
} from '../database/schemas/service-price.schema';
import { UpdateServicePricesDto } from './dto/update-service-prices.dto';

export const DEFAULT_SERVICE_PRICES: Array<{
  code: ServicePriceCodeEnum;
  label: string;
  category: string;
  amount: number;
  description: string;
}> = [
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

  async getEffectivePrices(branchId?: string) {
    if (!branchId || !Types.ObjectId.isValid(branchId)) {
      return DEFAULT_SERVICE_PRICES.map((price) => ({ ...price, isActive: true, branchId: null }));
    }

    const docs = await this.servicePriceModel.find({ branchId: new Types.ObjectId(branchId) }).lean().exec();
    const byCode = new Map(docs.map((doc) => [doc.code, doc]));

    return DEFAULT_SERVICE_PRICES.map((defaultPrice) => {
      const saved = byCode.get(defaultPrice.code);
      return {
        ...defaultPrice,
        _id: saved?._id,
        branchId,
        amount: saved?.amount ?? defaultPrice.amount,
        isActive: saved?.isActive ?? true,
      };
    });
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
      const defaultPrice = defaultsByCode.get(item.code);
      if (!defaultPrice) throw new BadRequestException(`Unsupported service price code: ${item.code}`);

      await this.servicePriceModel.findOneAndUpdate(
        { branchId: branchObjectId, code: item.code },
        {
          $set: {
            branchId: branchObjectId,
            code: item.code,
            label: defaultPrice.label,
            category: defaultPrice.category,
            amount: Math.round(Number(item.amount || 0) * 100) / 100,
            description: defaultPrice.description,
            isActive: item.isActive ?? true,
          },
        },
        { upsert: true, new: true },
      ).exec();
    }

    return this.getEffectivePrices(branchId);
  }
}
