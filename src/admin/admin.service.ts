import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { Patient } from '../database/schemas/patient.schema';
import { Order, OrderTypeEnum, OrderStatusEnum } from '../database/schemas/order.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { Prescription, PrescriptionStatusEnum } from '../database/schemas/prescription.schema';
import { Medication } from '../database/schemas/medication.schema';
import { Profile } from '../database/schemas/profile.schema';
import { UserRole } from '../database/schemas/user-role.schema';
import { AuditLog } from '../database/schemas/audit-log.schema';
import { Appointment, AppointmentStatusEnum } from '../database/schemas/appointment.schema';
import { Result } from '../database/schemas/result.schema';
import { Admission } from '../database/schemas/admission.schema';
import { SoapNote } from '../database/schemas/soap-note.schema';
import { PatientNote } from '../database/schemas/patient-note.schema';
import { WalletTransaction } from '../database/schemas/wallet-transaction.schema';
import { Sample } from '../database/schemas/sample.schema';
import { Queue } from '../database/schemas/queue.schema';
import { CashReconciliation } from '../database/schemas/cash-reconciliation.schema';
import { Expenditure } from '../database/schemas/expenditure.schema';
import { StockMovement } from '../database/schemas/stock-movement.schema';
import { Consultation } from '../database/schemas/consultation.schema';
import { CommunicationLog } from '../database/schemas/communication-log.schema';
import { CriticalResultNotification } from '../database/schemas/critical-result-notification.schema';
import { QcSample } from '../database/schemas/qc-sample.schema';
import { QcResult } from '../database/schemas/qc-result.schema';
import { Doctor } from '../database/schemas/doctor.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(OrderTest.name) private orderTestModel: Model<OrderTest>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Prescription.name) private prescriptionModel: Model<Prescription>,
    @InjectModel(Medication.name) private medicationModel: Model<Medication>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLog>,
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectModel(Result.name) private resultModel: Model<Result>,
    @InjectModel(Admission.name) private admissionModel: Model<Admission>,
    @InjectModel(SoapNote.name) private soapNoteModel: Model<SoapNote>,
    @InjectModel(PatientNote.name) private patientNoteModel: Model<PatientNote>,
    @InjectModel(WalletTransaction.name) private walletTxModel: Model<WalletTransaction>,
    @InjectModel(Sample.name) private sampleModel: Model<Sample>,
    @InjectModel(Queue.name) private queueModel: Model<Queue>,
    @InjectModel(CashReconciliation.name) private cashReconModel: Model<CashReconciliation>,
    @InjectModel(Expenditure.name) private expenditureModel: Model<Expenditure>,
    @InjectModel(StockMovement.name) private stockMovementModel: Model<StockMovement>,
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
    @InjectModel(CommunicationLog.name) private communicationLogModel: Model<CommunicationLog>,
    @InjectModel(CriticalResultNotification.name) private criticalResultModel: Model<CriticalResultNotification>,
    @InjectModel(QcSample.name) private qcSampleModel: Model<QcSample>,
    @InjectModel(QcResult.name) private qcResultModel: Model<QcResult>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
  ) {}

  private getDateRange(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = startDate ? new Date(startDate) : new Date(end);
    if (!startDate) start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  private kpiStatus(value: number | null, target: number, direction: 'higher' | 'lower' = 'higher') {
    if (value === null || Number.isNaN(value)) return 'manual';
    if (direction === 'higher') {
      if (value >= target) return 'green';
      if (value >= target * 0.8) return 'yellow';
      return 'red';
    }
    if (value <= target) return 'green';
    if (value <= target * 1.2) return 'yellow';
    return 'red';
  }

  private makeKpi(category: string, label: string, target: string, value: number | null, unit = '', owner = 'Admin', direction: 'higher' | 'lower' = 'higher', manual = false) {
    const numericTarget = Number((target.match(/[\d.]+/) || ['0'])[0]);
    return {
      category,
      label,
      target,
      value,
      unit,
      owner,
      status: manual ? 'manual' : this.kpiStatus(value, numericTarget, direction),
      manual,
    };
  }

  async getManagementKpis(startDate?: string, endDate?: string): Promise<any> {
    const { start, end } = this.getDateRange(startDate, endDate);
    const rangeFilter = { createdAt: { $gte: start, $lte: end } };
    const previousStart = new Date(start);
    previousStart.setTime(start.getTime() - (end.getTime() - start.getTime()) - 1);
    const previousEnd = new Date(start.getTime() - 1);
    const previousFilter = { createdAt: { $gte: previousStart, $lte: previousEnd } };

    const [
      visits,
      previousVisits,
      newPatients,
      payments,
      orders,
      appointments,
      lowStockCount,
      expiringCount,
    ] = await Promise.all([
      this.visitModel.find(rangeFilter).lean(),
      this.visitModel.find(previousFilter).lean(),
      this.patientModel.countDocuments(rangeFilter),
      this.paymentModel.find(rangeFilter).lean(),
      this.orderModel.find(rangeFilter).lean(),
      this.appointmentModel.find({ date: { $gte: start, $lte: end } }).lean(),
      this.medicationModel.countDocuments({ isActive: true, $expr: { $lte: ['$stockQuantity', '$reorderLevel'] } }),
      this.medicationModel.countDocuments({ isActive: true, expiryDate: { $lte: new Date(end.getTime() + 90 * 24 * 60 * 60 * 1000) } }),
    ]);

    const totalPatientsSeen = visits.length;
    const revenue = payments.reduce((sum, p: any) => sum + Number(p.amount || 0), 0);
    const avgRevenuePerPatient = totalPatientsSeen ? Math.round(revenue / totalPatientsSeen) : 0;
    const completedVisits = visits.filter((v: any) => v.status === VisitStatusEnum.COMPLETED).length;
    const ehrCompleted = visits.filter((v: any) => v.subjectiveNotes || v.objectiveNotes || v.assessmentNotes || v.planNotes || v.diagnosis).length;
    const ehrCompletionRate = totalPatientsSeen ? Math.round((ehrCompleted / totalPatientsSeen) * 100) : 0;
    const paidOrders = orders.filter((o: any) => o.paymentStatus === 'paid').length;
    const billableOrders = orders.filter((o: any) => o.status !== 'cancelled').length;
    const billingCollectionRate = billableOrders ? Math.round((paidOrders / billableOrders) * 100) : 100;
    const noShowOrCancelled = appointments.filter((a: any) => [AppointmentStatusEnum.NO_SHOW, AppointmentStatusEnum.CANCELLED].includes(a.status)).length;
    const noShowRate = appointments.length ? Math.round((noShowOrCancelled / appointments.length) * 100) : 0;
    const waitSamples = visits
      .map((v: any) => {
        const startTime = v.checkedInAt || v.createdAt;
        const endTime = v.consultationStartedAt || v.triagedAt;
        if (!startTime || !endTime) return null;
        return Math.max(0, new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000;
      })
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const avgWaitTime = waitSamples.length ? Math.round(waitSamples.reduce((s, v) => s + v, 0) / waitSamples.length) : 0;
    const digitalAppointmentRate = appointments.length ? Math.round((appointments.length / Math.max(appointments.length + totalPatientsSeen, 1)) * 100) : 0;
    const growthRate = previousVisits.length ? Math.round(((totalPatientsSeen - previousVisits.length) / previousVisits.length) * 100) : (totalPatientsSeen ? 100 : 0);

    const themedClinic = visits.reduce((acc: Record<string, number>, v: any) => {
      const key = String(v.visitType || v.clinicType || v.patientCategory || 'general').replace(/_/g, ' ');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const kpis = {
      overall: [
        this.makeKpi('Patient Volume', 'Total Patients Seen', '150', totalPatientsSeen, 'patients', 'Operations Lead'),
        this.makeKpi('Financial', 'Revenue', '1', revenue, 'Le', 'CEO'),
        this.makeKpi('Financial', 'Average Revenue per Patient', '1', avgRevenuePerPatient, 'Le', 'CEO'),
        this.makeKpi('Quality & Access', 'Average Wait Time', '30', avgWaitTime, 'min', 'Operations Lead', 'lower'),
        this.makeKpi('Efficiency', 'Stockout / Low Stock Incidents', '0', lowStockCount, 'items', 'Operations Lead', 'lower'),
        this.makeKpi('Efficiency', 'No-show / Cancellation Rate', '15', noShowRate, '%', 'IT Person', 'lower'),
        this.makeKpi('Growth', 'New Patients This Period', '15', growthRate, '%', 'CEO'),
      ],
      ceo: [
        this.makeKpi('Growth', 'Revenue Growth', '30', growthRate, '%', 'CEO'),
        this.makeKpi('Growth', 'New Patients', '15', newPatients, 'patients', 'CEO'),
        this.makeKpi('Strategy', 'Active Partnerships', '5', null, '', 'CEO', 'higher', true),
        this.makeKpi('Strategy', 'Franchise Readiness Score', '80', null, '%', 'CEO', 'higher', true),
        this.makeKpi('Compliance', 'Regulatory Compliance', '100', null, '%', 'CEO', 'higher', true),
      ],
      it: [
        this.makeKpi('Digital Growth', 'Appointments Booked Digitally', '70', digitalAppointmentRate, '%', 'IT Person'),
        this.makeKpi('Digital Growth', 'EHR Completion Rate', '95', ehrCompletionRate, '%', 'IT Person'),
        this.makeKpi('Reliability', 'System Uptime', '98', null, '%', 'IT Person', 'higher', true),
        this.makeKpi('Training', 'ECHO Technical Success', '100', null, '%', 'IT Person', 'higher', true),
        this.makeKpi('Security', 'Privacy Incidents', '0', 0, 'incidents', 'IT Person', 'lower'),
      ],
      clinical: [
        this.makeKpi('Utilization', 'Themed Clinic Utilization', '25', totalPatientsSeen, 'patients', 'Clinical Lead'),
        this.makeKpi('Records', 'Completed Encounters', '70', completedVisits, 'visits', 'Clinical Lead'),
        this.makeKpi('Outcomes', 'Immunization Completion Rate', '80', null, '%', 'Clinical Lead', 'higher', true),
        this.makeKpi('Outcomes', 'NCD Control Rate', '70', null, '%', 'Clinical Lead', 'higher', true),
        this.makeKpi('Safety', 'Clinical Incident Rate', '1', null, '%', 'Clinical Lead', 'lower', true),
      ],
      operations: [
        this.makeKpi('Efficiency', 'Average Patient Wait Time', '30', avgWaitTime, 'min', 'Operations Lead', 'lower'),
        this.makeKpi('Efficiency', 'Daily Patient Throughput', '30', Math.round(totalPatientsSeen / Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))), 'patients/day', 'Operations Lead'),
        this.makeKpi('Inventory', 'Low Stock Items', '0', lowStockCount, 'items', 'Operations Lead', 'lower'),
        this.makeKpi('Inventory', 'Expiring Soon Items', '0', expiringCount, 'items', 'Operations Lead', 'lower'),
        this.makeKpi('Billing', 'Billing Collection Rate', '98', billingCollectionRate, '%', 'Operations Lead'),
      ],
    };

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      summary: { totalPatientsSeen, revenue, avgRevenuePerPatient, avgWaitTime, noShowRate, ehrCompletionRate, billingCollectionRate, newPatients, themedClinic },
      kpis,
    };
  }

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
        visitsAwaitingTriage: visitStatusMap[VisitStatusEnum.AWAITING_TRIAGE] || 0,
        visitsInQueue: visitStatusMap[VisitStatusEnum.IN_QUEUE] || 0,
        visitsInConsultation: visitStatusMap[VisitStatusEnum.IN_CONSULTATION] || 0,
        visitsAwaitingLab: visitStatusMap[VisitStatusEnum.AWAITING_LAB] || 0,
        visitsAwaitingPharmacy: visitStatusMap[VisitStatusEnum.AWAITING_PHARMACY] || 0,
        visitsAwaitingDispensing: visitStatusMap[VisitStatusEnum.AWAITING_DISPENSING] || 0,
        visitsAwaitingResults: visitStatusMap[VisitStatusEnum.AWAITING_RESULTS] || 0,
        visitsResultsReady: visitStatusMap[VisitStatusEnum.RESULTS_READY] || 0,
        visitsAwaitingDoctorReview: visitStatusMap[VisitStatusEnum.AWAITING_DOCTOR_REVIEW] || 0,
        visitsAdmitted: visitStatusMap[VisitStatusEnum.ADMITTED] || 0,
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

  /**
   * Count records in each transactional collection (used by the UI to
   * preview what clearing test data will remove).
   */
  async getClearTestDataPreview(): Promise<Record<string, number>> {
    const [patients, visits, orders, orderTests, payments, prescriptions, results,
      admissions, soapNotes, patientNotes, walletTx, samples, queue, cashRecon,
      expenditures, stockMovements, consultations, communicationLogs,
      criticalResults, qcSamples, qcResults, appointments] = await Promise.all([
      this.patientModel.countDocuments(),
      this.visitModel.countDocuments(),
      this.orderModel.countDocuments(),
      this.orderTestModel.countDocuments(),
      this.paymentModel.countDocuments(),
      this.prescriptionModel.countDocuments(),
      this.resultModel.countDocuments(),
      this.admissionModel.countDocuments(),
      this.soapNoteModel.countDocuments(),
      this.patientNoteModel.countDocuments(),
      this.walletTxModel.countDocuments(),
      this.sampleModel.countDocuments(),
      this.queueModel.countDocuments(),
      this.cashReconModel.countDocuments(),
      this.expenditureModel.countDocuments(),
      this.stockMovementModel.countDocuments(),
      this.consultationModel.countDocuments(),
      this.communicationLogModel.countDocuments(),
      this.criticalResultModel.countDocuments(),
      this.qcSampleModel.countDocuments(),
      this.qcResultModel.countDocuments(),
      this.appointmentModel.countDocuments(),
    ]);
    return {
      patients, visits, orders, orderTests, payments, prescriptions, results,
      admissions, soapNotes, patientNotes, walletTransactions: walletTx, samples,
      queue, cashReconciliations: cashRecon, expenditures, stockMovements,
      consultations, communicationLogs: communicationLogs, criticalResultNotifications: criticalResults,
      qcSamples, qcResults, appointments,
    };
  }

  /**
   * Permanently delete all transactional/clinical data while keeping
   * reference data (users, branches, medications, rooms, doctor profiles,
   * LIS catalog, machines, suppliers) intact.
   *
   * Requires the caller to pass the literal phrase "DELETE ALL TEST DATA"
   * as proof that the action is intentional.
   */
  async clearTestData(actorUserId: string, confirmation: string): Promise<{
    deleted: Record<string, number>;
    preserved: string[];
    actor: string;
    timestamp: string;
  }> {
    if (confirmation !== 'DELETE ALL TEST DATA') {
      throw new Error('Invalid confirmation phrase');
    }

    const deleteMany = async <T>(model: Model<T>, query: any = {}): Promise<number> => {
      const result = await model.deleteMany(query).exec();
      return result.deletedCount || 0;
    };

    const [
      patients, visits, orders, orderTests, payments, prescriptions, results,
      admissions, soapNotes, patientNotes, walletTx, samples, queue, cashRecon,
      expenditures, stockMovements, consultations, communicationLogs,
      criticalResults, qcSamples, qcResults, appointments,
    ] = await Promise.all([
      deleteMany(this.patientModel),
      deleteMany(this.visitModel),
      deleteMany(this.orderModel),
      deleteMany(this.orderTestModel),
      deleteMany(this.paymentModel),
      deleteMany(this.prescriptionModel),
      deleteMany(this.resultModel),
      deleteMany(this.admissionModel),
      deleteMany(this.soapNoteModel),
      deleteMany(this.patientNoteModel),
      deleteMany(this.walletTxModel),
      deleteMany(this.sampleModel),
      deleteMany(this.queueModel),
      deleteMany(this.cashReconModel),
      deleteMany(this.expenditureModel),
      deleteMany(this.stockMovementModel),
      deleteMany(this.consultationModel),
      deleteMany(this.communicationLogModel),
      deleteMany(this.criticalResultModel),
      deleteMany(this.qcSampleModel),
      deleteMany(this.qcResultModel),
      deleteMany(this.appointmentModel),
      deleteMany(this.doctorModel, {}),
    ]);

    const deleted = {
      patients, visits, orders, orderTests, payments, prescriptions, results,
      admissions, soapNotes, patientNotes, walletTransactions: walletTx, samples,
      queue, cashReconciliations: cashRecon, expenditures, stockMovements,
      consultations, communicationLogs, criticalResultNotifications: criticalResults,
      qcSamples, qcResults, appointments,
    };

    const preserved = [
      'profiles (users)', 'user-roles', 'branches', 'medications', 'rooms',
      'doctors/specialists (will be reseeded from profiles)', 'test-catalog',
      'test-panels', 'test-reference-ranges', 'panel-interpretations',
      'machines', 'machine-maintenance', 'suppliers', 'report-templates',
      'id-sequences',
    ];

    const timestamp = new Date();
    try {
      const auditLogPayload: any = {
        userId: actorUserId ? new Types.ObjectId(actorUserId) : undefined,
        action: 'DELETE' as any,
        tableName: 'all_transactional_collections',
        recordId: 'clear_test_data',
        newData: { deleted, preserved } as any,
        ipAddress: undefined,
        userAgent: undefined,
      };
      await this.auditLogModel.create(auditLogPayload);
    } catch (e) {
      // audit log is best-effort; do not fail the operation
    }

    return {
      deleted,
      preserved,
      actor: actorUserId,
      timestamp: timestamp.toISOString(),
    };
  }
}
