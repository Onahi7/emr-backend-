import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Medication, MedicationCategoryEnum } from '../database/schemas/medication.schema';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

@Injectable()
export class MedicationsService {
  constructor(
    @InjectModel(Medication.name) private medicationModel: Model<Medication>,
  ) {}

  async create(createMedicationDto: CreateMedicationDto): Promise<Medication> {
    const { medicationCode, name, genericName } = createMedicationDto;

    // Check if medication code already exists
    const existing = await this.medicationModel.findOne({ medicationCode });
    if (existing) {
      throw new BadRequestException(`Medication with code ${medicationCode} already exists`);
    }

    // Check if medication name already exists
    const existingName = await this.medicationModel.findOne({
      $or: [{ name }, { genericName }],
    });
    if (existingName) {
      throw new BadRequestException(`Medication with this name already exists`);
    }

    const medication = new this.medicationModel(createMedicationDto);
    return medication.save();
  }

  async findAll(query: any = {}): Promise<Medication[]> {
    return this.medicationModel
      .find(query)
      .sort({ name: 1 })
      .exec();
  }

  async findById(id: string): Promise<Medication> {
    const medication = await this.medicationModel.findById(id);
    if (!medication) {
      throw new NotFoundException('Medication not found');
    }
    return medication;
  }

  async findByCode(medicationCode: string): Promise<Medication> {
    const medication = await this.medicationModel.findOne({ medicationCode });
    if (!medication) {
      throw new NotFoundException('Medication not found');
    }
    return medication;
  }

  async search(searchTerm: string): Promise<Medication[]> {
    return this.medicationModel
      .find({
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { genericName: { $regex: searchTerm, $options: 'i' } },
          { medicationCode: { $regex: searchTerm, $options: 'i' } },
        ],
      })
      .limit(20)
      .exec();
  }

  async findByCategory(category: MedicationCategoryEnum): Promise<Medication[]> {
    return this.medicationModel
      .find({ category, isActive: true })
      .sort({ name: 1 })
      .exec();
  }

  async findLowStock(): Promise<Medication[]> {
    return this.medicationModel
      .find({
        $expr: { $lte: ['$stockQuantity', '$reorderLevel'] },
        isActive: true,
      })
      .exec();
  }

  async update(id: string, updateMedicationDto: UpdateMedicationDto): Promise<Medication> {
    const medication = await this.medicationModel.findById(id);
    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    Object.assign(medication, updateMedicationDto);
    return medication.save();
  }

  async updateStock(id: string, quantity: number, operation: 'add' | 'subtract'): Promise<Medication> {
    const medication = await this.medicationModel.findById(id);
    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    if (operation === 'add') {
      medication.stockQuantity += quantity;
    } else {
      if (medication.stockQuantity < quantity) {
        throw new BadRequestException('Insufficient stock');
      }
      medication.stockQuantity -= quantity;
    }

    return medication.save();
  }

  async deactivate(id: string): Promise<Medication> {
    const medication = await this.medicationModel.findById(id);
    if (!medication) {
      throw new NotFoundException('Medication not found');
    }
    medication.isActive = false;
    return medication.save();
  }

  async getInventoryReport(): Promise<{
    total: number;
    lowStock: number;
    outOfStock: number;
    byCategory: Array<{ category: string; count: number }>;
  }> {
    const all = await this.medicationModel.find({ isActive: true });
    const lowStock = all.filter(m => m.stockQuantity <= m.reorderLevel);
    const outOfStock = all.filter(m => m.stockQuantity === 0);

    const byCategory = all.reduce((acc, med) => {
      const cat = med.category || 'other';
      const existing = acc.find(a => a.category === cat);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ category: cat, count: 1 });
      }
      return acc;
    }, [] as Array<{ category: string; count: number }>);

    return {
      total: all.length,
      lowStock: lowStock.length,
      outOfStock: outOfStock.length,
      byCategory,
    };
  }
}
