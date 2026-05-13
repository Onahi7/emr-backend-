import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { Patient } from '../database/schemas/patient.schema';
import { Order, OrderTypeEnum, OrderStatusEnum } from '../database/schemas/order.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { Prescription, PrescriptionStatusEnum } from '../database/schemas/prescription.schema';
import { Medication } from '../database/schemas/medication.schema';
import { Profile } from '../database/schemas/profile.schema';
import { UserRole } from '../database/schemas/user-role.schema';
import { AuditLog } from '../database/schemas/audit-log.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Prescription.name) private prescriptionModel: Model<Prescription>,
    @InjectModel(Medication.name) private medicationModel: Model<Medication>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLog>,
  ) {}

  /**
   * Full admin dashboard — hospital-wide summary
   */
  async getDashboard(date?: string): Promise<{
    todayStats: any;
    revenueBreakdown: any;
    departmentActivity: any;
    inventoryAlerts: any;
    staffSummary: any;
  }> {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    const dayFilter = { createdAt: { $gte: startOfDay, $lte: endOfDay } };

    const [
      totalPatients,
      newPatientsToday,
      totalVisitsToday,
      visitsByStatus,
      labOrdersToday,
      pharmacyOrdersToday,
      prescriptionsToday,
      revenueByType,
      lowStockMeds,
      expiredMeds,
      staffCount,
    ] = await Promise.all([
      this.patientModel.countDocuments({ isActive: true }),
      this.patientModel.countDocuments({ ...dayFilter }),
      this.visitModel.countDocuments({ ...dayFilter }),
      this.visitModel.aggregate([
        { $match: dayFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.orderModel.countDocuments({ ...dayFilter, orderType: OrderTypeEnum.LAB }),
      this.orderModel.countDocuments({ ...dayFilter, orderType: OrderTypeEnum.PHARMACY }),
      this.prescriptionModel.countDocuments({ ...dayFilter }),
      this.paymentModel.aggregate([
        { $match: dayFilter },
        {
          $group: {
            _id: '$paymentType',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.medicationModel.find({
        isActive: true,
        $expr: { $lte: ['$stockQuantity', '$reorderLevel'] },
      }).select('name stockQuantity reorderLevel').lean(),
      this.medicationModel.find({
        isActive: true,
        expiryDate: { $lte: new Date() },
      }).select('name expiryDate stockQuantity').lean(),
      this.profileModel.countDocuments({ isActive: true }),
    ]);

    // Build visit status map
    const visitStatusMap: Record<string, number> = {};
    for (const v of visitsByStatus) {
      visitStatusMap[v._id] = v.count;
    }

    // Build revenue breakdown
    let totalRevenue = 0;
    const revenueMap: Record<string, { total: number; count: number }> = {};
    for (const r of revenueByType) {
      revenueMap[r._id] = { total: r.total, count: r.count };
      totalRevenue += r.total;
    }

    return {
      todayStats: {
        date: targetDate.toISOString().split('T')[0],
        totalPatients,
        newPatientsToday,
        totalVisitsToday,
        visitsWaitingPayment: visitStatusMap[VisitStatusEnum.WAITING_PAYMENT] || 0,
        visitsInQueue: visitStatusMap[VisitStatusEnum.IN_QUEUE] || 0,
        visitsInConsultation: visitStatusMap[VisitStatusEnum.IN_CONSULTATION] || 0,
        visitsAwaitingLab: visitStatusMap[VisitStatusEnum.AWAITING_LAB] || 0,
        visitsAwaitingPharmacy: visitStatusMap[VisitStatusEnum.AWAITING_PHARMACY] || 0,
        visitsAwaitingDispensing: visitStatusMap[VisitStatusEnum.AWAITING_DISPENSING] || 0,
        visitsCompleted: visitStatusMap[VisitStatusEnum.COMPLETED] || 0,
        visitsCancelled: visitStatusMap[VisitStatusEnum.CANCELLED] || 0,
      },
      revenueBreakdown: {
        totalRevenue,
        consultationRevenue: revenueMap[PaymentTypeEnum.CONSULTATION]?.total || 0,
        labRevenue: revenueMap[PaymentTypeEnum.LAB_ORDER]?.total || 0,
        pharmacyRevenue: revenueMap[PaymentTypeEnum.PHARMACY_ORDER]?.total || 0,
        otherRevenue: revenueMap[PaymentTypeEnum.OTHER]?.total || 0,
        transactionCount: Object.values(revenueMap).reduce((s, r) => s + r.count, 0),
      },
      departmentActivity: {
        labOrdersToday,
        pharmacyOrdersToday,
        prescriptionsToday,
      },
      inventoryAlerts: {
        lowStockCount: lowStockMeds.length,
        expiredCount: expiredMeds.length,
        lowStockItems: lowStockMeds,
        expiredItems: expiredMeds,
      },
      staffSummary: {
        totalActiveStaff: staffCount,
      },
    };
  }

  /**
   * Revenue report — breakdown by date range and department
   */
  async getRevenueReport(startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const [dailyRevenue, revenueByType, revenueByMethod, topPayingPatients] = await Promise.all([
      // Daily revenue breakdown
      this.paymentModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            date: { $first: '$createdAt' },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
            cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$amount', 0] } },
            orangeMoney: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'orange_money'] }, '$amount', 0] } },
            afrimoney: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'afrimoney'] }, '$amount', 0] } },
          },
        },
        { $sort: { date: 1 } },
      ]),
      // Revenue by payment type
      this.paymentModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$paymentType', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // Revenue by payment method
      this.paymentModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // Top paying patients (via visits)
      this.paymentModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, visitId: { $exists: true } } },
        { $group: { _id: '$visitId', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'visits',
            localField: '_id',
            foreignField: '_id',
            as: 'visit',
          },
        },
        { $unwind: { path: '$visit', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'patients',
            localField: 'visit.patientId',
            foreignField: '_id',
            as: 'patient',
          },
        },
        { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            total: 1,
            patientName: { $concat: ['$patient.firstName', ' ', '$patient.lastName'] },
            patientId: '$patient.patientId',
          },
        },
      ]),
    ]);

    const totalRevenue = dailyRevenue.reduce((s: number, d: any) => s + d.total, 0);

    return {
      period: { startDate, endDate },
      totalRevenue,
      dailyRevenue,
      revenueByType,
      revenueByMethod,
      topPayingPatients,
    };
  }

  /**
   * Staff performance report
   */
  async getStaffReport(startDate?: string, endDate?: string): Promise<any> {
    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate) : new Date(new Date().setHours(23, 59, 59, 999));

    const [doctorActivity, receptionActivity] = await Promise.all([
      // Doctor activity — visits accepted and completed
      this.visitModel.aggregate([
        {
          $match: {
            doctorId: { $exists: true },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: '$doctorId',
            totalAccepted: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', VisitStatusEnum.COMPLETED] }, 1, 0] },
            },
          },
        },
        {
          $lookup: {
            from: 'profiles',
            localField: '_id',
            foreignField: '_id',
            as: 'doctor',
          },
        },
        { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            doctorName: '$doctor.fullName',
            totalAccepted: 1,
            completed: 1,
          },
        },
        { $sort: { totalAccepted: -1 } },
      ]),
      // Reception activity — payments received
      this.paymentModel.aggregate([
        {
          $match: {
            receivedBy: { $exists: true },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: '$receivedBy',
            totalCollected: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'profiles',
            localField: '_id',
            foreignField: '_id',
            as: 'staff',
          },
        },
        { $unwind: { path: '$staff', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            staffName: '$staff.fullName',
            totalCollected: 1,
            transactionCount: 1,
          },
        },
        { $sort: { totalCollected: -1 } },
      ]),
    ]);

    return {
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      doctorActivity,
      receptionActivity,
    };
  }

  /**
   * Patient statistics
   */
  async getPatientStats(startDate?: string, endDate?: string): Promise<any> {
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const [
      totalPatients,
      newPatients,
      patientsByCategory,
      patientsByGender,
      visitTrend,
    ] = await Promise.all([
      this.patientModel.countDocuments({ isActive: true }),
      this.patientModel.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      this.patientModel.aggregate([
        { $group: { _id: '$patientCategory', count: { $sum: 1 } } },
      ]),
      this.patientModel.aggregate([
        { $group: { _id: '$gender', count: { $sum: 1 } } },
      ]),
      this.visitModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            date: { $first: '$createdAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { date: 1 } },
      ]),
    ]);

    return {
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalPatients,
      newPatients,
      patientsByCategory,
      patientsByGender,
      visitTrend,
    };
  }
}
