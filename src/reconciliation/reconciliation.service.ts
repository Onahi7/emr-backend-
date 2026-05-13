import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CashReconciliation,
  ReconciliationStatusEnum,
} from '../database/schemas/cash-reconciliation.schema';
import { Order, PaymentStatusEnum } from '../database/schemas/order.schema';
import { Payment } from '../database/schemas/payment.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { Expenditure } from '../database/schemas/expenditure.schema';
import { Patient } from '../database/schemas/patient.schema';
import { Doctor } from '../database/schemas/doctor.schema';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { ReviewReconciliationDto } from './dto/review-reconciliation.dto';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(CashReconciliation.name)
    private reconciliationModel: Model<CashReconciliation>,
    @InjectModel(Order.name)
    private orderModel: Model<Order>,
    @InjectModel(Payment.name)
    private paymentModel: Model<Payment>,
    @InjectModel(OrderTest.name)
    private orderTestModel: Model<OrderTest>,
    @InjectModel(Expenditure.name)
    private expenditureModel: Model<Expenditure>,
    @InjectModel(Patient.name)
    private patientModel: Model<Patient>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<Doctor>,
  ) {}

  async getExpectedAmounts(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Use Payment model (same source as getDailyIncome) for gross collected
    const payments = await this.paymentModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .exec();

    // Gross collected by payment method
    const incomeCash = payments
      .filter((p) => p.paymentMethod === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);
    const incomeOrangeMoney = payments
      .filter((p) => p.paymentMethod === 'orange_money')
      .reduce((sum, p) => sum + p.amount, 0);
    const incomeAfrimoney = payments
      .filter((p) => p.paymentMethod === 'afrimoney')
      .reduce((sum, p) => sum + p.amount, 0);

    // Get all expenditures for the day
    const expenditures = await this.expenditureModel
      .find({
        expenditureDate: { $gte: startOfDay, $lte: endOfDay },
      })
      .exec();

    // Deduct expenditures per payment method
    const cashExpenditures = expenditures
      .filter((e) => e.paymentMethod === 'cash')
      .reduce((sum, e) => sum + e.amount, 0);
    const orangeExpenditures = expenditures
      .filter((e) => e.paymentMethod === 'orange_money')
      .reduce((sum, e) => sum + e.amount, 0);
    const afriExpenditures = expenditures
      .filter((e) => e.paymentMethod === 'afrimoney')
      .reduce((sum, e) => sum + e.amount, 0);
    const totalExpenditures = expenditures.reduce((sum, exp) => sum + exp.amount, 0);

    // Expected = gross collected per method minus expenditures per method
    const expectedCash = incomeCash - cashExpenditures;
    const expectedOrangeMoney = incomeOrangeMoney - orangeExpenditures;
    const expectedAfrimoney = incomeAfrimoney - afriExpenditures;

    // Get order counts
    const allOrders = await this.orderModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .exec();
    const paidOrders = allOrders.filter(
      (o) => o.paymentStatus === PaymentStatusEnum.PAID,
    );

    return {
      expectedCash,
      expectedOrangeMoney,
      expectedAfrimoney,
      expectedTotal: expectedCash + expectedOrangeMoney + expectedAfrimoney,
      totalOrders: allOrders.length,
      paidOrders: paidOrders.length,
      pendingOrders: allOrders.length - paidOrders.length,
      totalExpenditures,
      incomeCash,
      incomeOrangeMoney,
      incomeAfrimoney,
    };
  }

  async create(createDto: CreateReconciliationDto, userId: string) {
    const startOfDay = new Date(createDto.reconciliationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(createDto.reconciliationDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await this.reconciliationModel
      .findOne({ reconciliationDate: { $gte: startOfDay, $lte: endOfDay } })
      .exec();

    if (existing) {
      throw new BadRequestException('Reconciliation already exists for this date');
    }

    const expected = await this.getExpectedAmounts(createDto.reconciliationDate);
    const actualTotal = createDto.actualCash + createDto.actualOrangeMoney + createDto.actualAfrimoney;

    const reconciliation = new this.reconciliationModel({
      reconciliationDate: createDto.reconciliationDate,
      submittedBy: new Types.ObjectId(userId),
      submittedAt: new Date(),
      expectedCash: expected.expectedCash,
      expectedOrangeMoney: expected.expectedOrangeMoney,
      expectedAfrimoney: expected.expectedAfrimoney,
      expectedTotal: expected.expectedTotal,
      actualCash: createDto.actualCash,
      actualOrangeMoney: createDto.actualOrangeMoney,
      actualAfrimoney: createDto.actualAfrimoney,
      actualTotal,
      // Variance = expected − actual (positive = shortage, negative = surplus)
      cashVariance: expected.expectedCash - createDto.actualCash,
      orangeMoneyVariance: expected.expectedOrangeMoney - createDto.actualOrangeMoney,
      afrimoneyVariance: expected.expectedAfrimoney - createDto.actualAfrimoney,
      totalVariance: expected.expectedTotal - actualTotal,
      totalOrders: expected.totalOrders,
      paidOrders: expected.paidOrders,
      pendingOrders: expected.pendingOrders,
      notes: createDto.notes,
      status: ReconciliationStatusEnum.PENDING,
    });

    await reconciliation.save();
    this.logger.log(`Reconciliation created for ${createDto.reconciliationDate}`);
    return this.findOne(reconciliation._id.toString());
  }

  async findAll(status?: string) {
    const query: any = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    return this.reconciliationModel
      .find(query)
      .populate('submittedBy', 'fullName email')
      .populate('reviewedBy', 'fullName email')
      .sort({ reconciliationDate: -1 })
      .exec();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Reconciliation with ID ${id} not found`);
    }

    const reconciliation = await this.reconciliationModel
      .findById(id)
      .populate('submittedBy', 'fullName email')
      .populate('reviewedBy', 'fullName email')
      .exec();

    if (!reconciliation) {
      throw new NotFoundException(`Reconciliation with ID ${id} not found`);
    }

    return reconciliation;
  }

  async review(id: string, reviewDto: ReviewReconciliationDto, userId: string) {
    const reconciliation = await this.reconciliationModel.findById(id).exec();

    if (!reconciliation) {
      throw new NotFoundException(`Reconciliation with ID ${id} not found`);
    }

    if (reconciliation.status !== ReconciliationStatusEnum.PENDING) {
      throw new BadRequestException('Reconciliation has already been reviewed');
    }

    reconciliation.status = reviewDto.approved
      ? ReconciliationStatusEnum.APPROVED
      : ReconciliationStatusEnum.REJECTED;
    reconciliation.reviewedBy = new Types.ObjectId(userId);
    reconciliation.reviewedAt = new Date();
    reconciliation.reviewNotes = reviewDto.notes;

    await reconciliation.save();
    this.logger.log(`Reconciliation ${reviewDto.approved ? 'approved' : 'rejected'} by ${userId}`);

    return this.findOne(id);
  }

  async getPendingCount() {
    return this.reconciliationModel
      .countDocuments({ status: ReconciliationStatusEnum.PENDING })
      .exec();
  }

  async getDailyReport(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Orders
    const orders = await this.orderModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .lean();

    const totalOrders = orders.length;
    const paidOrders = orders.filter(o => o.paymentStatus === PaymentStatusEnum.PAID);
    const totalSubtotal = orders.reduce((s, o) => s + (o.subtotal || 0), 0);
    const totalDiscounts = orders.reduce((s, o) => s + (o.discount || 0), 0);
    const totalBilled = orders.reduce((s, o) => s + (o.total || 0), 0);

    // 2. Tests done (from OrderTest)
    const orderTests = await this.orderTestModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .lean();

    const totalTestsDone = orderTests.length;
    const completedTests = orderTests.filter(t => t.status === 'completed' || t.status === 'verified').length;
    const pendingTests = orderTests.filter(t => t.status === 'pending' || t.status === 'in_progress').length;

    // Test breakdown: count by panel (if part of panel) or individual test code
    const testBreakdownMap = new Map<string, number>();
    for (const ot of orderTests) {
      const key = ot.panelCode || ot.testCode;
      testBreakdownMap.set(key, (testBreakdownMap.get(key) || 0) + 1);
    }
    // De-duplicate panel counts: each panel should count once per order (not per test in panel)
    // We need to count unique (orderId, panelCode) pairs for panels, and individual tests otherwise
    const panelOrderCounts = new Map<string, Set<string>>();
    const standaloneTestBreakdown = new Map<string, number>();
    for (const ot of orderTests) {
      if (ot.panelCode) {
        if (!panelOrderCounts.has(ot.panelCode)) panelOrderCounts.set(ot.panelCode, new Set());
        panelOrderCounts.get(ot.panelCode)!.add(ot.orderId.toString());
      } else {
        standaloneTestBreakdown.set(ot.testCode, (standaloneTestBreakdown.get(ot.testCode) || 0) + 1);
      }
    }
    const testBreakdown: Array<{ name: string; count: number }> = [];
    panelOrderCounts.forEach((orderIds, panelCode) => {
      testBreakdown.push({ name: panelCode, count: orderIds.size });
    });
    standaloneTestBreakdown.forEach((count, code) => {
      testBreakdown.push({ name: code, count });
    });
    testBreakdown.sort((a, b) => b.count - a.count);

    // 3. Payments (actual money received)
    const payments = await this.paymentModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .lean();

    const cashCollected = payments
      .filter(p => p.paymentMethod === 'cash')
      .reduce((s, p) => s + p.amount, 0);
    const orangeCollected = payments
      .filter(p => p.paymentMethod === 'orange_money')
      .reduce((s, p) => s + p.amount, 0);
    const afriCollected = payments
      .filter(p => p.paymentMethod === 'afrimoney')
      .reduce((s, p) => s + p.amount, 0);
    const totalCollected = cashCollected + orangeCollected + afriCollected;

    // 4. Expenditures
    const expenditures = await this.expenditureModel
      .find({ expenditureDate: { $gte: startOfDay, $lte: endOfDay } })
      .lean();

    const cashExpenditure = expenditures
      .filter(e => e.paymentMethod === 'cash')
      .reduce((s, e) => s + e.amount, 0);
    const orangeExpenditure = expenditures
      .filter(e => e.paymentMethod === 'orange_money')
      .reduce((s, e) => s + e.amount, 0);
    const afriExpenditure = expenditures
      .filter(e => e.paymentMethod === 'afrimoney')
      .reduce((s, e) => s + e.amount, 0);
    const totalExpenditure = expenditures.reduce((s, e) => s + e.amount, 0);

    // 5. Net expected per method
    const netExpectedCash = cashCollected - cashExpenditure;
    const netExpectedOrange = orangeCollected - orangeExpenditure;
    const netExpectedAfri = afriCollected - afriExpenditure;
    const netExpectedTotal = totalCollected - totalExpenditure;

    // 6. Reconciliation (if submitted)
    const reconciliation = await this.reconciliationModel
      .findOne({ reconciliationDate: { $gte: startOfDay, $lte: endOfDay } })
      .populate('submittedBy', 'fullName')
      .lean();

    let submitted = null;
    if (reconciliation) {
      submitted = {
        actualCash: reconciliation.actualCash,
        actualOrangeMoney: reconciliation.actualOrangeMoney,
        actualAfrimoney: reconciliation.actualAfrimoney,
        actualTotal: reconciliation.actualTotal,
        cashVariance: reconciliation.cashVariance,
        orangeMoneyVariance: reconciliation.orangeMoneyVariance,
        afrimoneyVariance: reconciliation.afrimoneyVariance,
        totalVariance: reconciliation.totalVariance,
        status: reconciliation.status,
        submittedBy: (reconciliation.submittedBy as any)?.fullName || 'Unknown',
      };
    }

    return {
      date: startOfDay.toISOString(),
      orders: {
        total: totalOrders,
        paid: paidOrders.length,
        pending: totalOrders - paidOrders.length,
        subtotal: totalSubtotal,
        discounts: totalDiscounts,
        billed: totalBilled,
      },
      tests: {
        total: totalTestsDone,
        completed: completedTests,
        pending: pendingTests,
        breakdown: testBreakdown,
      },
      income: {
        cash: cashCollected,
        orangeMoney: orangeCollected,
        afrimoney: afriCollected,
        total: totalCollected,
      },
      expenditures: {
        cash: cashExpenditure,
        orangeMoney: orangeExpenditure,
        afrimoney: afriExpenditure,
        total: totalExpenditure,
        items: expenditures.map(e => ({
          description: e.description,
          amount: e.amount,
          paymentMethod: e.paymentMethod,
          category: (e as any).category,
        })),
      },
      netExpected: {
        cash: netExpectedCash,
        orangeMoney: netExpectedOrange,
        afrimoney: netExpectedAfri,
        total: netExpectedTotal,
      },
      reconciliation: submitted,
    };
  }

  async getDoctorReferralReport(params: { startDate?: Date; endDate?: Date; doctor?: string; doctorId?: string }) {
    const filter: any = {
      $or: [
        { referredByDoctor: { $exists: true, $nin: [null, ''] } },
        { doctorId: { $exists: true, $ne: null } },
      ],
    };

    if (params.startDate || params.endDate) {
      filter.createdAt = {};
      if (params.startDate) {
        const s = new Date(params.startDate);
        s.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = s;
      }
      if (params.endDate) {
        const e = new Date(params.endDate);
        e.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = e;
      }
    }

    if (params.doctorId && Types.ObjectId.isValid(params.doctorId)) {
      filter.doctorId = new Types.ObjectId(params.doctorId);
    } else if (params.doctor) {
      filter.referredByDoctor = { $regex: params.doctor, $options: 'i' };
    }

    const orders = await this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean();

    if (orders.length === 0) return { rows: [], summary: { totalOrders: 0, totalBilled: 0, totalDiscount: 0, totalPaid: 0, doctors: [] } };

    // Fetch all order tests for the matching orders in one query
    const orderIds = orders.map(o => o._id);
    const orderTests = await this.orderTestModel
      .find({ orderId: { $in: orderIds } })
      .lean();

    const testsByOrder = new Map<string, typeof orderTests>();
    for (const ot of orderTests) {
      const key = ot.orderId.toString();
      if (!testsByOrder.has(key)) testsByOrder.set(key, []);
      testsByOrder.get(key)!.push(ot);
    }

    // Fetch patients
    const patientIds = [...new Set(orders.map(o => o.patientId.toString()))];
    const patients = await this.patientModel
      .find({ _id: { $in: patientIds.map(id => new Types.ObjectId(id)) } })
      .lean();
    const patientMap = new Map(patients.map(p => [p._id.toString(), p]));

    const doctorIds = [
      ...new Set(
        orders
          .map((o) => o.doctorId?.toString())
          .filter((id): id is string => !!id),
      ),
    ];
    const doctorDocs = doctorIds.length > 0
      ? await this.doctorModel.find({ _id: { $in: doctorIds.map((id) => new Types.ObjectId(id)) } }).lean()
      : [];
    const doctorLookup = new Map(doctorDocs.map((d) => [d._id.toString(), d]));

    // Build rows
    const rows = orders.map(order => {
      const patient = patientMap.get(order.patientId.toString());
      const patientName = patient
        ? `${patient.firstName} ${patient.lastName}`
        : 'Unknown';

      const tests = testsByOrder.get(order._id.toString()) || [];
      // Summarise: panels (deduplicated by panelCode) + standalone tests
      const panelsSeen = new Set<string>();
      const testLabels: string[] = [];
      for (const t of tests) {
        if (t.panelCode) {
          if (!panelsSeen.has(t.panelCode)) {
            panelsSeen.add(t.panelCode);
            testLabels.push(t.panelCode);
          }
        } else {
          testLabels.push(t.testCode);
        }
      }

      return {
        orderNumber: order.orderNumber,
        date: order.createdAt,
        patientName,
        doctor: order.doctorId
          ? (doctorLookup.get(order.doctorId.toString())?.fullName || order.referredByDoctor || '')
          : (order.referredByDoctor || ''),
        tests: testLabels.join(', '),
        subtotal: order.subtotal || 0,
        discount: order.discount || 0,
        total: order.total || 0,
        amountPaid: order.amountPaid || 0,
        paymentStatus: order.paymentStatus,
      };
    });

    // Summary per doctor
    const doctorSummaryMap = new Map<string, { orders: number; billed: number; discount: number; paid: number }>();
    for (const row of rows) {
      const key = row.doctor;
      if (!doctorSummaryMap.has(key)) doctorSummaryMap.set(key, { orders: 0, billed: 0, discount: 0, paid: 0 });
      const d = doctorSummaryMap.get(key)!;
      d.orders += 1;
      d.billed += row.total;
      d.discount += row.discount;
      d.paid += row.amountPaid;
    }

    const doctors = Array.from(doctorSummaryMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.orders - a.orders);

    return {
      rows,
      summary: {
        totalOrders: rows.length,
        totalBilled: rows.reduce((s, r) => s + r.total, 0),
        totalDiscount: rows.reduce((s, r) => s + r.discount, 0),
        totalPaid: rows.reduce((s, r) => s + r.amountPaid, 0),
        doctors,
      },
    };
  }
}
