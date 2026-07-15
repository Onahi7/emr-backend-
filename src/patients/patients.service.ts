import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Patient } from '../database/schemas/patient.schema';
import { PatientNote } from '../database/schemas/patient-note.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { WalletTransaction, WalletTransactionTypeEnum } from '../database/schemas/wallet-transaction.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { Order, OrderStatusEnum, OrderTypeEnum, PaymentStatusEnum } from '../database/schemas/order.schema';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreatePatientNoteDto } from './dto/create-patient-note.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { LisIntegrationService } from '../lis-integration/lis-integration.service';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(PatientNote.name) private patientNoteModel: Model<PatientNote>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    @InjectModel(WalletTransaction.name) private walletTransactionModel: Model<WalletTransaction>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private realtimeGateway: RealtimeGateway,
    private lisIntegrationService: LisIntegrationService,
  ) {}

  /**
   * Generate unique patient ID in format: PAT-YYYYMMDD-XXXX
   */
  private async generatePatientId(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const sequenceId = `patient_id_${datePart}`;

    // Find and increment the sequence atomically
    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      {
        $inc: { currentValue: 1 },
        $setOnInsert: { prefix: 'PAT', datePart },
      },
      { upsert: true, new: true },
    );

    const paddedValue = sequence.currentValue.toString().padStart(4, '0');
    return `PAT-${datePart}-${paddedValue}`;
  }

  /**
   * Create a new patient
   */
  async create(
    createPatientDto: CreatePatientDto,
    userId?: string,
    branchId?: string,
  ): Promise<Patient> {
    try {
      const patientId = await this.generatePatientId();

      const patient = new this.patientModel({
        ...createPatientDto,
        patientId,
        branchId: branchId ? new Types.ObjectId(branchId) : undefined,
        registeredBy: userId ? new Types.ObjectId(userId) : undefined,
      });

      const savedPatient = await patient.save();
      this.logger.log(`Patient created: ${savedPatient.patientId}`);

      // Emit real-time event
      this.realtimeGateway.notifyPatientCreated(savedPatient);

      return savedPatient;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000) {
        const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
        if (keyPattern?.email) {
          throw new ConflictException('Patient with this email already exists');
        }
        if (keyPattern?.mrn) {
          throw new ConflictException('Patient with this MRN already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Find all patients with pagination and search
   */
  async findAll(
    page: number = 1,
    limit: number = 1000,
    search?: string,
    branchId?: string,
  ): Promise<{ data: Patient[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (search) {
      query.$or = [
        { patientId: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { mrn: { $regex: search, $options: 'i' } },
      ];
    }

    if (branchId) {
      // Cast string to ObjectId so the query matches documents that have
      // branchId stored as either ObjectId (legacy) or string (newly created
      // without explicit cast). Mongoose's auto-cast can be unreliable for
      // optional fields, so we wrap with $or to cover both forms.
      const branchObjId = new Types.ObjectId(branchId);
      query.$or = [
        { branchId: branchObjId },
        { branchId: branchId },
      ];
      delete query.branchId;
    }

    const [data, total] = await Promise.all([
      this.patientModel
        .find(query)
        .populate('registeredBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.patientModel.countDocuments(query).exec(),
    ]);

    return { data: data as unknown as Patient[], total, page, limit };
  }

  /**
   * Find patient by ID
   */
  async findOne(id: string, branchId?: string): Promise<Patient> {
    // Accept either a Mongo _id (ObjectId) or a patientId string like PAT-YYYYMMDD-XXXX
    const query: any = Types.ObjectId.isValid(id) ? { _id: new Types.ObjectId(id) } : { patientId: id };
    if (branchId) {
      const branchObjId = new Types.ObjectId(branchId);
      query.$or = [{ branchId: branchObjId }, { branchId: branchId }];
    }

    const patient = await this.patientModel
      .findOne(query)
      .populate('registeredBy', 'fullName email')
      .exec();

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return patient;
  }

  /**
   * Find patient by patient ID (PAT-YYYYMMDD-XXXX)
   */
  async findByPatientId(patientId: string, branchId?: string): Promise<Patient> {
    const query: any = { patientId };
    if (branchId) {
      query.branchId = branchId;
    }

    const patient = await this.patientModel
      .findOne(query)
      .populate('registeredBy', 'fullName email')
      .exec();

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    return patient;
  }

  /**
   * Check for potential duplicate patients by phone or name
   */
  async checkDuplicates(
    firstName?: string,
    lastName?: string,
    phone?: string,
    branchId?: string,
  ): Promise<Array<{ patientId: string; firstName: string; lastName: string; phone?: string; createdAt: Date }>> {
    const conditions: any[] = [];

    if (phone) {
      const digits = phone.replace(/\D/g, '');
      const localDigits = digits.startsWith('232') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
      if (localDigits) {
        const normalizedPhone = `+232${localDigits}`;
        conditions.push({ phone: { $regex: new RegExp(`^${normalizedPhone.replace('+', '\\+')}$`, 'i') } });
      }
    }

    if (firstName && lastName) {
      conditions.push({
        firstName: { $regex: new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        lastName: { $regex: new RegExp(`^${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
    }

    if (conditions.length === 0) return [];

    const filter: any = { $or: conditions };

    if (branchId) {
      const branchObjId = new Types.ObjectId(branchId);
      filter.$and = [
        { $or: conditions },
        { $or: [{ branchId: branchObjId }, { branchId: branchId }] },
      ];
      delete filter.$or;
    }

    const matches = await this.patientModel
      .find(filter)
      .select('patientId firstName lastName phone createdAt')
      .limit(5)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return matches;
  }

  /**
   * Search patients by name, ID, phone, or MRN
   */
  async search(query: string, branchId?: string): Promise<Patient[]> {
    const filter: any = {
      $or: [
        { patientId: { $regex: query, $options: 'i' } },
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { mrn: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
      ],
    };

    if (branchId) {
      // Match both ObjectId (proper) and string (legacy data) forms
      const branchObjId = new Types.ObjectId(branchId);
      const original = filter.$or;
      filter.$and = [
        { $or: original },
        { $or: [{ branchId: branchObjId }, { branchId: branchId }] },
      ];
      delete filter.$or;
    }

    const patients = await this.patientModel
      .find(filter)
      .populate('registeredBy', 'fullName email')
      .limit(1000)
      .exec();

    return patients;
  }

  /**
   * Update patient
   */
  async update(id: string, updatePatientDto: UpdatePatientDto, branchId?: string): Promise<Patient> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    try {
      const query: any = { _id: new Types.ObjectId(id) };
      if (branchId) {
        query.branchId = new Types.ObjectId(branchId);
      }

      const patient = await this.patientModel
        .findOneAndUpdate(query, updatePatientDto, { new: true })
        .populate('registeredBy', 'fullName email')
        .exec();

      if (!patient) {
        throw new NotFoundException(`Patient with ID ${id} not found`);
      }

      this.logger.log(`Patient updated: ${patient.patientId}`);
      return patient;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000) {
        const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
        if (keyPattern?.email) {
          throw new ConflictException('Patient with this email already exists');
        }
        if (keyPattern?.mrn) {
          throw new ConflictException('Patient with this MRN already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete patient (admin only)
   */
  async remove(id: string, branchId?: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    const query: any = { _id: new Types.ObjectId(id) };
    if (branchId) {
      query.branchId = new Types.ObjectId(branchId);
    }

    const result = await this.patientModel.findOneAndDelete(query).exec();

    if (!result) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    this.logger.log(`Patient deleted: ${result.patientId}`);
  }

  /**
   * Add note to patient
   */
  async addNote(
    patientId: string,
    createNoteDto: CreatePatientNoteDto,
    userId?: string,
    branchId?: string,
  ): Promise<PatientNote> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patientQuery: any = { _id: new Types.ObjectId(patientId) };
    if (branchId) {
      patientQuery.branchId = new Types.ObjectId(branchId);
    }

    const patient = await this.patientModel.findOne(patientQuery).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const note = new this.patientNoteModel({
      patientId: new Types.ObjectId(patientId),
      note: createNoteDto.note,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    const savedNote = await note.save();
    this.logger.log(`Note added to patient: ${patient.patientId}`);

    return savedNote;
  }

  /**
   * Get patient notes
   */
  async getNotes(patientId: string, branchId?: string): Promise<PatientNote[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const noteQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      noteQuery.branchId = branchId;
    }

    const notes = await this.patientNoteModel
      .find(noteQuery)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    return notes;
  }

  /**
   * Get patient orders
   */
  async getOrders(patientId: string, branchId?: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patientQuery: any = { _id: new Types.ObjectId(patientId) };
    if (branchId) {
      patientQuery.branchId = new Types.ObjectId(branchId);
    }

    const patient = await this.patientModel.findOne(patientQuery).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Import Order model dynamically to avoid circular dependency
    const Order = this.patientModel.db.model('Order');
    const OrderTest = this.patientModel.db.model('OrderTest');

    const orderQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      orderQuery.branchId = branchId;
    }

    const orders = await Order.find(orderQuery)
      .populate('orderedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Attach order_tests so callers can display test names/codes
    const ordersWithTests = await Promise.all(
      orders.map(async (order: any) => {
        const testQuery: any = { orderId: order._id };
        if (branchId) {
          testQuery.branchId = branchId;
        }
        const tests = await OrderTest.find(testQuery).lean().exec();
        return { ...order, order_tests: tests };
      }),
    );

    return ordersWithTests;
  }

  /**
   * Get patient results
   */
  async getResults(patientId: string, branchId?: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patientQuery: any = { _id: new Types.ObjectId(patientId) };
    if (branchId) {
      patientQuery.branchId = new Types.ObjectId(branchId);
    }

    const patient = await this.patientModel.findOne(patientQuery).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Get all orders for this patient
    const Order = this.patientModel.db.model('Order');
    const orderQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      orderQuery.branchId = branchId;
    }
    const orders = await Order.find(orderQuery).exec();
    const orderIds = orders.map((order: any) => order._id);

    // Get all results for these orders
    const Result = this.patientModel.db.model('Result');
    const resultQuery: any = { orderId: { $in: orderIds } };
    if (branchId) {
      resultQuery.branchId = branchId;
    }
    const results = await Result.find(resultQuery)
      .populate('orderId', 'orderNumber')
      .populate('resultedBy', 'fullName email')
      .populate('verifiedBy', 'fullName email')
      .sort({ resultedAt: -1 })
      .exec();

    return results;
  }

  /**
   * Get comprehensive patient chart (EMR data)
   * Returns patient info, consultations, prescriptions, SOAP notes, orders with results, vitals history
   */
  async getPatientChart(patientId: string, userRoles: string[] = [], branchId?: string): Promise<any> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Get patient
    const patientQuery: any = { _id: new Types.ObjectId(patientId) };
    if (branchId) {
      patientQuery.branchId = new Types.ObjectId(branchId);
    }

    const patient = await this.patientModel
      .findOne(patientQuery)
      .populate('registeredBy', 'fullName email')
      .exec();

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Get consultations with SOAP notes
    const Consultation = this.patientModel.db.model('Consultation');
    const consultationQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      consultationQuery.branchId = branchId;
    }
    const consultations = await Consultation.find(consultationQuery)
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Get SOAP notes separately to get vitals
    const SoapNote = this.patientModel.db.model('SoapNote');
    const soapQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      soapQuery.branchId = branchId;
    }
    const soapNotes = await SoapNote.find(soapQuery)
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Get visit-level triage vitals recorded by nurses before doctor consultation.
    const Visit = this.patientModel.db.model('Visit');
    const visitQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      visitQuery.branchId = branchId;
    }
    const visits = await Visit.find(visitQuery)
      .populate('triagedBy', 'fullName')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Get prescriptions with items
    const Prescription = this.patientModel.db.model('Prescription');
    const prescriptionQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      prescriptionQuery.branchId = branchId;
    }
    const prescriptions = await Prescription.find(prescriptionQuery)
      .populate('doctorId', 'fullName')
      .populate('dispensedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Get orders with order tests and results
    const Order = this.patientModel.db.model('Order');
    const OrderTest = this.patientModel.db.model('OrderTest');
    const Result = this.patientModel.db.model('Result');

    const orderQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      orderQuery.branchId = branchId;
    }

    const orders = await Order.find(orderQuery)
      .populate('doctorId', 'fullName')
      .populate('orderedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Auto-fetch LIS results for synced orders (fire-and-forget, non-blocking)
    for (const order of orders as any[]) {
      if (order.orderType === 'lab' && order.lisSyncStatus === 'synced' && !order.lisExternalRequestId) {
        // skip — no external request ID
        continue;
      }
      if (order.orderType === 'lab' && order.lisSyncStatus === 'synced' && order.lisExternalRequestId) {
        this.lisIntegrationService.fetchAndStoreResults(order._id.toString()).catch(() => {});
      }
    }

    // For each order, get order tests and results
    const ordersWithDetails = await Promise.all(
      orders.map(async (order: any) => {
        const otQuery: any = { orderId: order._id };
        if (branchId) {
          otQuery.branchId = branchId;
        }
        const orderTests = await OrderTest.find(otQuery)
          .populate('testId')
          .exec();

        const resQuery: any = { orderId: order._id };
        if (branchId) {
          resQuery.branchId = branchId;
        }
        const results = await Result.find(resQuery)
          .populate('resultedBy', 'fullName')
          .populate('verifiedBy', 'fullName')
          .exec();

        return {
          ...order.toObject(),
          orderTests,
          results,
        };
      })
    );

    // Get patient notes
    const notesQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      notesQuery.branchId = branchId;
    }
    const notes = await this.patientNoteModel
      .find(notesQuery)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    // Get admissions with ward nursing records for follow-up and future reference
    const Admission = this.patientModel.db.model('Admission');
    const admissionQuery: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      admissionQuery.branchId = branchId;
    }
    const admissions = await Admission.find(admissionQuery)
      .populate('doctorId', 'fullName department')
      .populate('primaryNurseId', 'fullName')
      .populate('vitalsLog.recordedBy', 'fullName')
      .populate('medicationLog.administeredBy', 'fullName')
      .populate('fluidBalance.recordedBy', 'fullName')
      .populate('nursingNotes.authoredBy', 'fullName')
      .sort({ admittedAt: -1 })
      .exec();

    const hasVitals = (vitals: any) =>
      !!vitals &&
      [
        'bloodPressure',
        'temperature',
        'heartRate',
        'respiratoryRate',
        'weight',
        'height',
        'oxygenSaturation',
        'bmi',
      ].some((key) => vitals[key] !== undefined && vitals[key] !== null && vitals[key] !== '');

    // Build one consistent vitals history from nurse triage, SOAP notes, and inpatient nursing vitals.
    const triageVitalsHistory = visits
      .map((visit: any) => ({
        date: visit.triagedAt || visit.createdAt,
        source: 'triage',
        visitId: visit._id,
        visitNumber: visit.visitNumber,
        recordedBy: visit.triagedBy,
        vitalSigns: {
          bloodPressure: visit.bloodPressure,
          temperature: visit.temperature,
          heartRate: visit.heartRate,
          respiratoryRate: visit.respiratoryRate,
          weight: visit.weight,
          height: visit.height,
          oxygenSaturation: visit.oxygenSaturation,
          bmi: visit.bmi,
        },
      }))
      .filter((entry: any) => hasVitals(entry.vitalSigns));

    const soapVitalsHistory = soapNotes
      .filter((note: any) => hasVitals(note.vitalSigns))
      .map((note: any) => ({
        date: note.createdAt,
        source: 'soap',
        visitId: note.visitId,
        recordedBy: note.nurseId || note.doctorId,
        vitalSigns: note.vitalSigns,
      }));

    const admissionVitalsHistory = admissions.flatMap((admission: any) =>
      (admission.vitalsLog || [])
        .filter((reading: any) => hasVitals(reading))
        .map((reading: any) => ({
          date: reading.recordedAt || admission.admittedAt,
          source: 'admission',
          admissionId: admission._id,
          admissionNumber: admission.admissionNumber,
          recordedBy: reading.recordedBy,
          vitalSigns: {
            bloodPressure: reading.bloodPressure,
            temperature: reading.temperature,
            heartRate: reading.heartRate,
            respiratoryRate: reading.respiratoryRate,
            weight: reading.weight,
            height: reading.height,
            oxygenSaturation: reading.oxygenSaturation,
          },
        })),
    );

    const vitalsHistory = [
      ...triageVitalsHistory,
      ...soapVitalsHistory,
      ...admissionVitalsHistory,
    ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      patient,
      visits,
      consultations,
      prescriptions,
      soapNotes,
      orders: ordersWithDetails,
      admissions,
      notes,
      vitalsHistory,
      summary: {
        totalConsultations: consultations.length,
        totalPrescriptions: prescriptions.length,
        totalAdmissions: admissions.length,
        totalLabOrders: orders.length,
        pendingLabOrders: orders.filter((o: any) => o.status !== 'completed').length,
        lastVisit: consultations.length > 0 ? (consultations[0] as any).createdAt : null,
      },
    };
  }

  // ─── Wallet System ───

  async getWalletBalance(patientId: string, branchId?: string): Promise<{ patientId: string; balance: number; lastUpdated: Date | null }> {
    const patient = await this.patientModel.findById(patientId).select('walletBalance walletLastUpdated').lean();
    if (!patient) throw new NotFoundException('Patient not found');
    return {
      patientId,
      balance: patient.walletBalance || 0,
      lastUpdated: patient.walletLastUpdated || null,
    };
  }

  private async recordTransaction(
    patientId: Types.ObjectId,
    type: WalletTransactionTypeEnum,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    branchId?: string,
    opts?: { notes?: string; reference?: string; paymentMethod?: string; performedBy?: string; orderId?: string },
  ): Promise<WalletTransaction> {
    const tx = new this.walletTransactionModel({
      patientId,
      branchId,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      notes: opts?.notes,
      reference: opts?.reference,
      paymentMethod: opts?.paymentMethod,
      performedBy: opts?.performedBy ? new Types.ObjectId(opts.performedBy) : undefined,
      orderId: opts?.orderId ? new Types.ObjectId(opts.orderId) : undefined,
    });
    return tx.save();
  }

  async depositToWallet(patientId: string, amount: number, notes?: string, userId?: string, paymentMethod = 'cash', branchId?: string): Promise<any> {
    if (amount <= 0) throw new BadRequestException('Deposit amount must be positive');
    const depositedAt = new Date();
    const patient = await this.patientModel.findById(patientId);
    if (!patient) throw new NotFoundException('Patient not found');
    const effectiveBranchId = branchId || patient.branchId?.toString();
    const balanceBefore = patient.walletBalance || 0;
    patient.walletBalance = balanceBefore + amount;
    patient.walletLastUpdated = depositedAt;
    await patient.save();
    await this.recordTransaction(
      new Types.ObjectId(patientId),
      WalletTransactionTypeEnum.DEPOSIT,
      amount,
      balanceBefore,
      patient.walletBalance,
      effectiveBranchId,
      { notes, performedBy: userId, paymentMethod },
    );
    // Create a Payment record so wallet deposits appear in daily income aggregation
    await this.paymentModel.create({
      branchId: effectiveBranchId,
      patientId: new Types.ObjectId(patientId),
      paymentType: PaymentTypeEnum.OTHER,
      amount,
      paymentMethod,
      receivedBy: userId ? new Types.ObjectId(userId) : undefined,
      notes: notes
        ? `Wallet deposit for patient ${patient.patientId || patient._id}: ${notes}`
        : `Wallet deposit for patient ${patient.patientId || patient._id}`,
      createdAt: depositedAt,
    });

    const autoApplied = await this.applyWalletToOutstandingOrders(patient, userId, effectiveBranchId, notes);
    this.realtimeGateway.emitToBranch(effectiveBranchId, 'wallet:updated', {
      patientId,
      balance: patient.walletBalance,
      type: 'deposit',
      amount,
      notes,
      paymentMethod,
      autoAppliedAmount: autoApplied.totalApplied,
      timestamp: depositedAt,
    });
    return {
      patientId,
      balance: patient.walletBalance,
      type: 'deposit',
      amount,
      notes,
      paymentMethod,
      autoAppliedAmount: autoApplied.totalApplied,
      autoAppliedOrders: autoApplied.orders,
      timestamp: depositedAt,
    };
  }

  private getPaymentTypeForOrder(orderType: OrderTypeEnum): PaymentTypeEnum {
    if (orderType === OrderTypeEnum.LAB) return PaymentTypeEnum.LAB_ORDER;
    if (orderType === OrderTypeEnum.PHARMACY) return PaymentTypeEnum.PHARMACY_ORDER;
    if (orderType === OrderTypeEnum.CONSULTATION) return PaymentTypeEnum.CONSULTATION;
    return PaymentTypeEnum.OTHER;
  }

  private getPaidStatusForOrder(orderType: OrderTypeEnum): OrderStatusEnum {
    if (orderType === OrderTypeEnum.LAB) return OrderStatusEnum.PENDING_COLLECTION;
    if (orderType === OrderTypeEnum.PHARMACY) return OrderStatusEnum.PAID;
    return OrderStatusEnum.COMPLETED;
  }

  private async applyWalletToOutstandingOrders(
    patient: Patient,
    userId?: string,
    branchId?: string,
    depositNotes?: string,
  ): Promise<{ totalApplied: number; orders: Array<{ orderId: string; orderNumber: string; amount: number }> }> {
    const patientObjectId = patient._id as Types.ObjectId;
    const effectiveBranchId = branchId || patient.branchId?.toString();
    const query: any = {
      patientId: patientObjectId,
      paymentStatus: { $in: [PaymentStatusEnum.PENDING, PaymentStatusEnum.PARTIAL] },
      status: { $ne: OrderStatusEnum.CANCELLED },
    };
    if (effectiveBranchId) query.branchId = effectiveBranchId;

    const orders = await this.orderModel.find(query).sort({ createdAt: 1 }).exec();
    const appliedOrders: Array<{ orderId: string; orderNumber: string; amount: number }> = [];
    let totalApplied = 0;

    for (const order of orders) {
      const walletBalance = Math.round((patient.walletBalance || 0) * 100) / 100;
      if (walletBalance <= 0) break;

      const remaining = Math.round(((order.balance ?? (order.total - (order.amountPaid || 0))) || 0) * 100) / 100;
      if (remaining <= 0) continue;

      const amountToApply = Math.min(walletBalance, remaining);
      const balanceBefore = walletBalance;
      patient.walletBalance = Math.round((walletBalance - amountToApply) * 100) / 100;
      patient.walletLastUpdated = new Date();

      await this.recordTransaction(
        patientObjectId,
        WalletTransactionTypeEnum.PAYMENT,
        amountToApply,
        balanceBefore,
        patient.walletBalance,
        effectiveBranchId,
        {
          notes: depositNotes || `Auto-applied wallet deposit to ${order.orderNumber}`,
          reference: `Auto payment for order ${order.orderNumber}`,
          paymentMethod: 'wallet',
          performedBy: userId,
          orderId: order._id.toString(),
        },
      );

      await this.paymentModel.create({
        branchId: effectiveBranchId,
        orderId: order._id,
        patientId: patientObjectId,
        visitId: order.visitId,
        paymentType: this.getPaymentTypeForOrder(order.orderType),
        amount: amountToApply,
        paymentMethod: 'wallet',
        receivedBy: userId ? new Types.ObjectId(userId) : undefined,
        notes: `Auto-applied from wallet deposit${depositNotes ? `: ${depositNotes}` : ''}`,
      });

      order.amountPaid = Math.round(((order.amountPaid || 0) + amountToApply) * 100) / 100;
      order.balance = Math.round((order.total - order.amountPaid) * 100) / 100;
      if (order.amountPaid >= order.total) {
        order.paymentStatus = PaymentStatusEnum.PAID;
        order.balance = 0;
      } else {
        order.paymentStatus = PaymentStatusEnum.PARTIAL;
      }
      if (order.paymentStatus === PaymentStatusEnum.PAID && order.status === OrderStatusEnum.AWAITING_PAYMENT) {
        order.status = this.getPaidStatusForOrder(order.orderType);
      }
      await order.save();

      totalApplied = Math.round((totalApplied + amountToApply) * 100) / 100;
      appliedOrders.push({ orderId: order._id.toString(), orderNumber: order.orderNumber, amount: amountToApply });

      const populatedOrder = await this.orderModel
        .findById(order._id)
        .populate('patientId', 'patientId firstName lastName walletBalance')
        .lean()
        .exec();
      this.realtimeGateway.notifyOrderUpdated(populatedOrder || order);
    this.realtimeGateway.emitToBranch(effectiveBranchId, 'wallet:updated', {
        patientId: patientObjectId.toString(),
        balance: patient.walletBalance,
        type: 'payment',
        amount: amountToApply,
        orderId: order._id.toString(),
      });

      if (order.orderType === OrderTypeEnum.LAB && order.paymentStatus === PaymentStatusEnum.PAID) {
        this.lisIntegrationService.syncPaymentToLis(
          order._id.toString(),
          order.amountPaid,
          'wallet',
          effectiveBranchId,
        ).catch(err => this.logger.error(`LIS payment sync failed for ${order.orderNumber}: ${err?.message}`));
      }
    }

    if (totalApplied > 0) {
      await patient.save();
      this.logger.log(`Auto-applied Le ${totalApplied} from wallet to ${appliedOrders.length} outstanding order(s) for patient ${patientObjectId}`);
    }

    return { totalApplied, orders: appliedOrders };
  }

  async withdrawFromWallet(patientId: string, amount: number, notes?: string, userId?: string, branchId?: string): Promise<any> {
    if (amount <= 0) throw new BadRequestException('Withdrawal amount must be positive');
    const patient = await this.patientModel.findById(patientId);
    if (!patient) throw new NotFoundException('Patient not found');
    const currentBalance = patient.walletBalance || 0;
    if (amount > currentBalance) {
      throw new BadRequestException(`Insufficient wallet balance. Available: Le ${currentBalance.toLocaleString()}`);
    }
    const balanceBefore = currentBalance;
    patient.walletBalance = currentBalance - amount;
    patient.walletLastUpdated = new Date();
    await patient.save();
    await this.recordTransaction(
      new Types.ObjectId(patientId),
      WalletTransactionTypeEnum.WITHDRAWAL,
      amount,
      balanceBefore,
      patient.walletBalance,
      branchId,
      { notes, performedBy: userId },
    );
    this.realtimeGateway.emitToBranch(branchId, 'wallet:updated', { patientId, balance: patient.walletBalance, type: 'withdrawal', amount, notes });
    return { patientId, balance: patient.walletBalance, type: 'withdrawal', amount, notes, timestamp: new Date() };
  }

  async payFromWallet(patientId: string, amount: number, orderId?: string, userId?: string, branchId?: string): Promise<any> {
    return this.withdrawFromWallet(patientId, amount, orderId ? `Payment for order ${orderId}` : 'Order payment', userId, branchId);
  }

  async getWalletTransactions(
    patientId: string,
    page: number = 1,
    limit: number = 50,
    branchId?: string,
  ): Promise<{ data: WalletTransaction[]; total: number; page: number; limit: number }> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }
    const skip = (page - 1) * limit;
    const filter: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) {
      filter.branchId = branchId;
    }
    const [data, total] = await Promise.all([
      this.walletTransactionModel
        .find(filter)
        .populate('performedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.walletTransactionModel.countDocuments(filter).exec(),
    ]);
    return { data: data as unknown as WalletTransaction[], total, page, limit };
  }

}
