import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TreatmentPlan, TreatmentPlanStatusEnum, TreatmentPlanItemTypeEnum } from '../database/schemas/treatment-plan.schema';
import { Patient } from '../database/schemas/patient.schema';
import { Visit } from '../database/schemas/visit.schema';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { OrdersService } from '../orders/orders.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PriorityEnum } from '../database/schemas/order.schema';

@Injectable()
export class TreatmentPlansService {
  private readonly logger = new Logger(TreatmentPlansService.name);

  constructor(
    @InjectModel(TreatmentPlan.name) private treatmentPlanModel: Model<TreatmentPlan>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    private prescriptionsService: PrescriptionsService,
    private ordersService: OrdersService,
    private realtimeGateway: RealtimeGateway,
  ) {}

  private async generatePlanNumber(branchId?: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    const countFilter: any = { createdAt: { $gte: startOfDay, $lt: endOfDay } };
    if (branchId) countFilter.branchId = branchId;
    const count = await this.treatmentPlanModel.countDocuments(countFilter);
    return `TP-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateTreatmentPlanDto, userId: string, branchId?: string): Promise<TreatmentPlan> {
    // Validate patient
    const patient = await this.patientModel.findById(dto.patientId);
    if (!patient) throw new NotFoundException('Patient not found');

    // Validate visit if provided
    if (dto.visitId) {
      const visit = await this.visitModel.findById(dto.visitId);
      if (!visit) throw new NotFoundException('Visit not found');
      if (visit.patientId.toString() !== dto.patientId) {
        throw new BadRequestException('Visit does not belong to the specified patient');
      }
    }

    const prescriptionIds: Types.ObjectId[] = [];
    const orderIds: Types.ObjectId[] = [];
    const planItems: TreatmentPlan['items'] = [];
    let totalAmount = 0;

    for (const item of dto.items) {
      if (item.type === TreatmentPlanItemTypeEnum.DRUG || item.type === TreatmentPlanItemTypeEnum.IV) {
        // Create a real Prescription
        if (!item.medicationId || !item.medicationName || !item.strengthPerDose || !item.dosesPerDay || !item.durationDays) {
          throw new BadRequestException(`Drug/IV items require medicationId, medicationName, strengthPerDose, dosesPerDay, durationDays`);
        }
        const quantity = item.dosesPerDay * item.durationDays;
        const rx = await this.prescriptionsService.create(
          {
            patientId: dto.patientId,
            visitId: dto.visitId,
            items: [{
              medicationId: item.medicationId,
              medicationName: item.medicationName,
              strengthPerDose: item.strengthPerDose,
              dosesPerDay: item.dosesPerDay,
              durationDays: item.durationDays,
              quantity,
              route: (item.route as any) || (item.type === TreatmentPlanItemTypeEnum.IV ? 'intravenous' : 'oral'),
            }],
          },
          userId,
          branchId,
        );
        prescriptionIds.push(new Types.ObjectId(rx._id.toString()));
        const itemAmount = rx.totalAmount || 0;
        totalAmount += itemAmount;
        planItems.push({
          type: item.type,
          description: `${item.medicationName} ${item.strengthPerDose} — ${item.dosesPerDay}x/day × ${item.durationDays}d (${quantity} units)`,
          amount: itemAmount,
          refId: new Types.ObjectId(rx._id.toString()),
        });
      } else if (item.type === TreatmentPlanItemTypeEnum.LAB || item.type === TreatmentPlanItemTypeEnum.PROCEDURE) {
        // Create a real Order
        if (!item.testCode || !item.testName || item.testPrice === undefined) {
          throw new BadRequestException(`Lab/Procedure items require testCode, testName, testPrice`);
        }
        const order = await this.ordersService.create(
          {
            patientId: dto.patientId,
            visitId: dto.visitId,
            orderType: item.type === TreatmentPlanItemTypeEnum.LAB ? 'lab' as any : 'procedure' as any,
            priority: PriorityEnum.ROUTINE,
            tests: [{
              testCode: item.testCode,
              testName: item.testName,
              price: item.testPrice,
              testId: item.testId,
            }],
          },
          userId,
          branchId,
        );
        orderIds.push(new Types.ObjectId(order._id.toString()));
        totalAmount += item.testPrice;
        planItems.push({
          type: item.type,
          description: item.testName,
          amount: item.testPrice,
          refId: new Types.ObjectId(order._id.toString()),
        });
      } else {
        // Other — descriptive only
        const desc = item.description || 'Other item';
        const amt = item.amount || 0;
        totalAmount += amt;
        planItems.push({
          type: TreatmentPlanItemTypeEnum.OTHER,
          description: desc,
          amount: amt,
        });
      }
    }

    const planNumber = await this.generatePlanNumber(branchId);
    const userObjId = new Types.ObjectId(userId);

    const plan = new this.treatmentPlanModel({
      branchId,
      planNumber,
      patientId: new Types.ObjectId(dto.patientId),
      visitId: dto.visitId ? new Types.ObjectId(dto.visitId) : undefined,
      createdBy: userObjId,
      createdByName: (patient as any).firstName + ' ' + (patient as any).lastName, // Will be overwritten below
      createdByRole: 'doctor', // Will be set by controller
      status: TreatmentPlanStatusEnum.DRAFT,
      prescriptionIds,
      orderIds,
      items: planItems,
      totalAmount,
      notes: dto.notes,
    });

    const saved = await plan.save();
    this.logger.log(`Treatment plan created: ${saved.planNumber}`);
    return this.findById(saved._id.toString());
  }

  async findById(id: string): Promise<TreatmentPlan> {
    const plan = await this.treatmentPlanModel
      .findById(id)
      .populate('patientId', 'patientId firstName lastName phone age gender')
      .populate('visitId', 'visitNumber status')
      .populate('createdBy', 'fullName role')
      .populate('prescriptionIds')
      .populate('orderIds')
      .populate('printedBy', 'fullName');
    if (!plan) throw new NotFoundException('Treatment plan not found');
    return plan;
  }

  async findAll(query: any = {}, branchId?: string): Promise<TreatmentPlan[]> {
    const filter = branchId ? { ...query, branchId } : query;
    return this.treatmentPlanModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName phone')
      .populate('visitId', 'visitNumber status')
      .populate('createdBy', 'fullName role')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getForPatient(patientId: string, branchId?: string): Promise<TreatmentPlan[]> {
    const filter: any = { patientId };
    if (branchId) filter.branchId = branchId;
    return this.treatmentPlanModel
      .find(filter)
      .populate('visitId', 'visitNumber status')
      .populate('createdBy', 'fullName role')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getForVisit(visitId: string, branchId?: string): Promise<TreatmentPlan[]> {
    const filter: any = { visitId };
    if (branchId) filter.branchId = branchId;
    return this.treatmentPlanModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName phone')
      .populate('createdBy', 'fullName role')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getSentPlans(branchId?: string): Promise<TreatmentPlan[]> {
    return this.findAll({ status: TreatmentPlanStatusEnum.SENT_TO_RECEPTION }, branchId);
  }

  async sendToReception(id: string): Promise<TreatmentPlan> {
    const plan = await this.treatmentPlanModel.findById(id);
    if (!plan) throw new NotFoundException('Treatment plan not found');
    if (plan.status !== TreatmentPlanStatusEnum.DRAFT) {
      throw new BadRequestException('Only draft plans can be sent to reception');
    }
    plan.status = TreatmentPlanStatusEnum.SENT_TO_RECEPTION;
    plan.sentToReceptionAt = new Date();
    await plan.save();
    this.realtimeGateway.emitToAll('treatment-plan:sent', { planId: plan._id, planNumber: plan.planNumber });
    return this.findById(id);
  }

  async markPrinted(id: string, userId: string): Promise<TreatmentPlan> {
    const plan = await this.treatmentPlanModel.findById(id);
    if (!plan) throw new NotFoundException('Treatment plan not found');
    plan.printedAt = new Date();
    plan.printedBy = new Types.ObjectId(userId);
    await plan.save();
    return this.findById(id);
  }

  async updateStatus(id: string, status: TreatmentPlanStatusEnum): Promise<TreatmentPlan> {
    const plan = await this.treatmentPlanModel.findById(id);
    if (!plan) throw new NotFoundException('Treatment plan not found');
    plan.status = status;
    await plan.save();
    return this.findById(id);
  }

  async cancel(id: string, userId: string): Promise<TreatmentPlan> {
    const plan = await this.treatmentPlanModel.findById(id);
    if (!plan) throw new NotFoundException('Treatment plan not found');
    if (plan.status !== TreatmentPlanStatusEnum.DRAFT) {
      throw new BadRequestException('Only draft plans can be cancelled');
    }
    plan.status = TreatmentPlanStatusEnum.CANCELLED;
    await plan.save();
    return this.findById(id);
  }
}
