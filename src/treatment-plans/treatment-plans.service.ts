import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TreatmentPlan, TreatmentPlanStatusEnum, TreatmentPlanItemTypeEnum, TreatmentPlanPaymentStatusEnum } from '../database/schemas/treatment-plan.schema';
import { Patient } from '../database/schemas/patient.schema';
import { Profile } from '../database/schemas/profile.schema';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { WalletTransaction, WalletTransactionTypeEnum } from '../database/schemas/wallet-transaction.schema';
import { Prescription } from '../database/schemas/prescription.schema';
import { Order, OrderStatusEnum, PaymentStatusEnum } from '../database/schemas/order.schema';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { OrdersService } from '../orders/orders.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { PayTreatmentPlanDto } from './dto/pay-treatment-plan.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PriorityEnum } from '../database/schemas/order.schema';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Injectable()
export class TreatmentPlansService {
  private readonly logger = new Logger(TreatmentPlansService.name);

  constructor(
    @InjectModel(TreatmentPlan.name) private treatmentPlanModel: Model<TreatmentPlan>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(WalletTransaction.name) private walletTransactionModel: Model<WalletTransaction>,
    @InjectModel(Prescription.name) private prescriptionModel: Model<Prescription>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
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

  async create(dto: CreateTreatmentPlanDto, userId: string, branchId?: string, reqUserRole?: string): Promise<TreatmentPlan> {
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
      // Closed visits cannot receive new plans
      if (['completed', 'cancelled'].includes(visit.status)) {
        throw new BadRequestException(`Cannot create treatment plan for a visit with status "${visit.status}"`);
      }
      // Only the treating doctor may add plans while a consultation is in progress
      if (visit.status === 'in_consultation' && reqUserRole !== UserRoleEnum.DOCTOR && reqUserRole !== UserRoleEnum.SPECIALIST && reqUserRole !== UserRoleEnum.ADMIN) {
        throw new BadRequestException('Cannot create treatment plan while the patient is in consultation');
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
              instructions: item.notes,
            }],
          },
          userId,
          branchId,
          reqUserRole,
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
          reqUserRole,
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

    // Resolve user's name from Profile
    const userProfile = await this.profileModel.findById(userId).select('fullName').lean();
    const creatorName = userProfile?.fullName || 'Unknown';

    const plan = new this.treatmentPlanModel({
      branchId,
      planNumber,
      patientId: new Types.ObjectId(dto.patientId),
      visitId: dto.visitId ? new Types.ObjectId(dto.visitId) : undefined,
      createdBy: userObjId,
      createdByName: creatorName,
      createdByRole: reqUserRole || 'doctor',
      status: TreatmentPlanStatusEnum.DRAFT,
      prescriptionIds,
      orderIds,
      items: planItems,
      totalAmount,
      balance: totalAmount,
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
    if (plan.status !== TreatmentPlanStatusEnum.SENT_TO_RECEPTION && plan.status !== TreatmentPlanStatusEnum.PAID) {
      throw new BadRequestException('Only sent or paid plans can be marked as printed');
    }
    plan.printedAt = new Date();
    plan.printedBy = new Types.ObjectId(userId);
    await plan.save();
    return this.findById(id);
  }

  private static readonly VALID_TRANSITIONS: Record<TreatmentPlanStatusEnum, TreatmentPlanStatusEnum[]> = {
    [TreatmentPlanStatusEnum.DRAFT]: [TreatmentPlanStatusEnum.SENT_TO_RECEPTION, TreatmentPlanStatusEnum.CANCELLED],
    [TreatmentPlanStatusEnum.SENT_TO_RECEPTION]: [TreatmentPlanStatusEnum.PAID, TreatmentPlanStatusEnum.CANCELLED],
    [TreatmentPlanStatusEnum.PAID]: [TreatmentPlanStatusEnum.COMPLETED, TreatmentPlanStatusEnum.CANCELLED],
    [TreatmentPlanStatusEnum.COMPLETED]: [],
    [TreatmentPlanStatusEnum.CANCELLED]: [],
  };

  async updateStatus(id: string, status: TreatmentPlanStatusEnum): Promise<TreatmentPlan> {
    const plan = await this.treatmentPlanModel.findById(id);
    if (!plan) throw new NotFoundException('Treatment plan not found');
    const allowed = TreatmentPlansService.VALID_TRANSITIONS[plan.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot transition from "${plan.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`);
    }
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

    // Clean up child prescriptions
    for (const rxId of plan.prescriptionIds) {
      try {
        await this.prescriptionModel.findByIdAndDelete(rxId);
      } catch (err) {
        this.logger.warn(`Failed to delete prescription ${rxId} during plan cancellation: ${err}`);
      }
    }

    // Clean up child orders
    for (const orderId of plan.orderIds) {
      try {
        const order = await this.orderModel.findById(orderId);
        if (order) {
          order.status = OrderStatusEnum.CANCELLED;
          await order.save();
        }
      } catch (err) {
        this.logger.warn(`Failed to cancel order ${orderId} during plan cancellation: ${err}`);
      }
    }

    return this.findById(id);
  }

  async pay(id: string, dto: PayTreatmentPlanDto, userId: string, branchId?: string): Promise<TreatmentPlan> {
    const plan = await this.treatmentPlanModel.findById(id);
    if (!plan) throw new NotFoundException('Treatment plan not found');
    if (plan.status === TreatmentPlanStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot pay for a cancelled plan');
    }

    // Normalize to payments array — support both single and split
    const payments: { amount: number; paymentMethod: string }[] = [];
    if (dto.payments && dto.payments.length > 0) {
      for (const p of dto.payments) {
        payments.push({ amount: p.amount, paymentMethod: p.paymentMethod });
      }
    } else if (dto.amount && dto.paymentMethod) {
      payments.push({ amount: dto.amount, paymentMethod: dto.paymentMethod });
    } else {
      throw new BadRequestException('Provide either "amount" + "paymentMethod" or "payments" array');
    }

    // Validate total
    const totalPayment = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = plan.totalAmount - (plan.amountPaid || 0);
    if (totalPayment > remaining + 0.01) {
      throw new BadRequestException(`Total payment (Le ${totalPayment}) exceeds remaining balance (Le ${remaining})`);
    }

    // Load patient once for wallet operations
    let patient = await this.patientModel.findById(plan.patientId);
    if (!patient) throw new NotFoundException('Patient not found');

    for (const split of payments) {
      // Handle wallet payment — deduct from patient wallet
      if (split.paymentMethod === 'wallet') {
        const balanceBefore = patient.walletBalance || 0;
        if (split.amount > balanceBefore) {
          throw new BadRequestException(`Insufficient wallet balance. Available: Le ${balanceBefore.toLocaleString()}, requested: Le ${split.amount.toLocaleString()}`);
        }
        patient.walletBalance = balanceBefore - split.amount;
        patient.walletLastUpdated = new Date();
        await patient.save();
        await this.walletTransactionModel.create({
          patientId: plan.patientId,
          type: WalletTransactionTypeEnum.PAYMENT,
          amount: split.amount,
          balanceBefore,
          balanceAfter: patient.walletBalance,
          reference: `Payment for treatment plan ${plan.planNumber}`,
          paymentMethod: 'wallet',
          performedBy: new Types.ObjectId(userId),
        });
        this.realtimeGateway.emitToAll('wallet:updated', {
          patientId: plan.patientId.toString(),
          balance: patient.walletBalance,
          type: 'payment',
          amount: split.amount,
        });
      }

      // Create payment record for each split
      await this.paymentModel.create({
        branchId,
        treatmentPlanId: plan._id,
        visitId: plan.visitId,
        patientId: plan.patientId,
        paymentType: PaymentTypeEnum.OTHER,
        amount: split.amount,
        paymentMethod: split.paymentMethod,
        receivedBy: new Types.ObjectId(userId),
        notes: dto.notes || `Treatment plan ${plan.planNumber} payment`,
      });

      plan.amountPaid = Math.round(((plan.amountPaid || 0) + split.amount) * 100) / 100;
    }

    // Update plan balance
    plan.balance = Math.round((plan.totalAmount - plan.amountPaid) * 100) / 100;

    if (plan.balance <= 0) {
      plan.paymentStatus = TreatmentPlanPaymentStatusEnum.PAID;
      plan.status = TreatmentPlanStatusEnum.PAID;
      plan.balance = 0;
      // Mark all child prescriptions as paid
      for (const rxId of plan.prescriptionIds) {
        await this.prescriptionModel.findByIdAndUpdate(rxId, { $set: { isPaid: true } });
      }
      // Mark all child orders as paid
      for (const orderId of plan.orderIds) {
        const order = await this.orderModel.findById(orderId);
        if (order && order.paymentStatus !== PaymentStatusEnum.PAID) {
          order.amountPaid = order.total;
          order.balance = 0;
          order.paymentStatus = PaymentStatusEnum.PAID;
          if (order.status === OrderStatusEnum.AWAITING_PAYMENT) {
            order.status = order.orderType === 'lab' ? OrderStatusEnum.PENDING_COLLECTION : OrderStatusEnum.PAID;
          }
          await order.save();
        }
      }
      this.realtimeGateway.emitToAll('treatment-plan:paid', { planId: plan._id, planNumber: plan.planNumber });
    } else {
      plan.paymentStatus = TreatmentPlanPaymentStatusEnum.PARTIAL;
    }

    await plan.save();
    this.logger.log(`Treatment plan ${plan.planNumber} payment: Le ${totalPayment} (${payments.map(p => p.paymentMethod).join(' + ')}), remaining: Le ${plan.balance}`);
    return this.findById(id);
  }
}
