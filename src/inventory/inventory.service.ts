import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Medication } from '../database/schemas/medication.schema';
import { StockMovement, StockMovementTypeEnum } from '../database/schemas/stock-movement.schema';
import { Supplier } from '../database/schemas/supplier.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';

interface StockReceiptDto {
  medicationId: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: Date;
  unitCost?: number;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  notes?: string;
}

interface StockAdjustmentDto {
  medicationId: string;
  quantity: number; // positive or negative
  reason: string;
  notes?: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectModel(Medication.name) private medicationModel: Model<Medication>,
    @InjectModel(StockMovement.name) private stockMovementModel: Model<StockMovement>,
    @InjectModel(Supplier.name) private supplierModel: Model<Supplier>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Record stock receipt from supplier
   */
  async receiveStock(dto: StockReceiptDto, performedBy: string): Promise<StockMovement> {
    const medication = await this.medicationModel.findById(dto.medicationId);
    if (!medication) throw new NotFoundException('Medication not found');
    if (dto.quantity <= 0) throw new BadRequestException('Quantity must be positive');

    const stockBefore = medication.stockQuantity;
    const stockAfter = stockBefore + dto.quantity;

    // Update medication stock + batch info
    medication.stockQuantity = stockAfter;
    if (dto.batchNumber) medication.batchNumber = dto.batchNumber;
    if (dto.expiryDate) medication.expiryDate = dto.expiryDate;
    if (dto.unitCost) medication.unitPrice = dto.unitCost;
    await medication.save();

    const movement = await this.stockMovementModel.create({
      medicationId: new Types.ObjectId(dto.medicationId),
      movementType: StockMovementTypeEnum.RECEIPT,
      quantity: dto.quantity,
      batchNumber: dto.batchNumber,
      expiryDate: dto.expiryDate,
      unitCost: dto.unitCost,
      totalCost: dto.unitCost ? dto.unitCost * dto.quantity : undefined,
      supplierId: dto.supplierId ? new Types.ObjectId(dto.supplierId) : undefined,
      supplierName: dto.supplierName,
      invoiceNumber: dto.invoiceNumber,
      notes: dto.notes,
      stockBefore,
      stockAfter,
      performedBy: new Types.ObjectId(performedBy),
    });

    this.logger.log(`Stock received: ${medication.name} +${dto.quantity} (batch: ${dto.batchNumber || 'N/A'})`);
    this.realtimeGateway.emitToAll('inventory:stock_received', { medication, movement });
    return movement;
  }

  /**
   * Manual stock adjustment (correction)
   */
  async adjustStock(dto: StockAdjustmentDto, performedBy: string): Promise<StockMovement> {
    const medication = await this.medicationModel.findById(dto.medicationId);
    if (!medication) throw new NotFoundException('Medication not found');

    const stockBefore = medication.stockQuantity;
    const stockAfter = stockBefore + dto.quantity;
    if (stockAfter < 0) throw new BadRequestException('Adjustment would result in negative stock');

    medication.stockQuantity = stockAfter;
    await medication.save();

    const movement = await this.stockMovementModel.create({
      medicationId: new Types.ObjectId(dto.medicationId),
      movementType: StockMovementTypeEnum.ADJUSTMENT,
      quantity: dto.quantity,
      reason: dto.reason,
      notes: dto.notes,
      stockBefore,
      stockAfter,
      performedBy: new Types.ObjectId(performedBy),
    });

    this.logger.log(`Stock adjusted: ${medication.name} ${dto.quantity > 0 ? '+' : ''}${dto.quantity} (${dto.reason})`);
    this.realtimeGateway.emitToAll('inventory:stock_adjusted', { medication, movement });
    return movement;
  }

  /**
   * Remove expired stock
   */
  async removeExpired(medicationId: string, quantity: number, reason: string, performedBy: string) {
    const medication = await this.medicationModel.findById(medicationId);
    if (!medication) throw new NotFoundException('Medication not found');
    if (quantity > medication.stockQuantity) throw new BadRequestException('Cannot remove more than current stock');

    const stockBefore = medication.stockQuantity;
    const stockAfter = stockBefore - quantity;
    medication.stockQuantity = stockAfter;
    await medication.save();

    return this.stockMovementModel.create({
      medicationId: new Types.ObjectId(medicationId),
      movementType: StockMovementTypeEnum.EXPIRED,
      quantity: -quantity,
      reason,
      stockBefore,
      stockAfter,
      performedBy: new Types.ObjectId(performedBy),
    });
  }

  /**
   * Get all stock movements with optional filters
   */
  async getMovements(filters: { medicationId?: string; movementType?: string; startDate?: string; endDate?: string; limit?: number }) {
    const query: any = {};
    if (filters.medicationId) query.medicationId = new Types.ObjectId(filters.medicationId);
    if (filters.movementType) query.movementType = filters.movementType;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    return this.stockMovementModel
      .find(query)
      .populate('medicationId', 'name medicationCode dosageForm strength')
      .populate('performedBy', 'full_name email')
      .populate('supplierId', 'name')
      .sort({ createdAt: -1 })
      .limit(filters.limit || 200)
      .exec();
  }

  /**
   * Low stock alert — items at or below reorder level
   */
  async getLowStockItems() {
    return this.medicationModel
      .find({
        isActive: true,
        $expr: { $lte: ['$stockQuantity', '$reorderLevel'] },
      })
      .sort({ stockQuantity: 1 })
      .exec();
  }

  /**
   * Expiring soon — items within N days of expiry
   */
  async getExpiringSoon(daysAhead: number = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);

    return this.medicationModel
      .find({
        isActive: true,
        expiryDate: { $ne: null, $lte: cutoff },
        stockQuantity: { $gt: 0 },
      })
      .sort({ expiryDate: 1 })
      .exec();
  }

  /**
   * Inventory dashboard summary
   */
  async getDashboard() {
    const [totalMedications, lowStockCount, expiringSoonCount, stockValue, recentMovements] =
      await Promise.all([
        this.medicationModel.countDocuments({ isActive: true }),
        this.medicationModel.countDocuments({
          isActive: true,
          $expr: { $lte: ['$stockQuantity', '$reorderLevel'] },
        }),
        this.medicationModel.countDocuments({
          isActive: true,
          expiryDate: { $ne: null, $lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
          stockQuantity: { $gt: 0 },
        }),
        this.medicationModel.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: null, total: { $sum: { $multiply: ['$stockQuantity', '$unitPrice'] } } } },
        ]),
        this.stockMovementModel
          .find()
          .populate('medicationId', 'name')
          .sort({ createdAt: -1 })
          .limit(10)
          .exec(),
      ]);

    return {
      totalMedications,
      lowStockCount,
      expiringSoonCount,
      stockValue: stockValue[0]?.total || 0,
      recentMovements,
    };
  }

  // ---------- Suppliers ----------
  async createSupplier(data: { name: string; contactPerson?: string; phone?: string; email?: string; address?: string }) {
    const existing = await this.supplierModel.findOne({ name: data.name });
    if (existing) return existing;
    return this.supplierModel.create(data);
  }

  async listSuppliers(activeOnly: boolean = true) {
    const query: any = {};
    if (activeOnly) query.isActive = true;
    return this.supplierModel.find(query).sort({ name: 1 }).exec();
  }

  async updateSupplier(id: string, data: any) {
    const supplier = await this.supplierModel.findByIdAndUpdate(id, data, { new: true });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }
}
