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
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreatePatientNoteDto } from './dto/create-patient-note.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(PatientNote.name) private patientNoteModel: Model<PatientNote>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    @InjectModel(WalletTransaction.name) private walletTransactionModel: Model<WalletTransaction>,
    private realtimeGateway: RealtimeGateway,
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
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    const query: any = { _id: id };
    if (branchId) {
      query.branchId = branchId;
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
      filter.branchId = branchId;
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
      const query: any = { _id: id };
      if (branchId) {
        query.branchId = branchId;
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

    const query: any = { _id: id };
    if (branchId) {
      query.branchId = branchId;
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
    const patientQuery: any = { _id: patientId };
    if (branchId) {
      patientQuery.branchId = branchId;
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
    const patientQuery: any = { _id: patientId };
    if (branchId) {
      patientQuery.branchId = branchId;
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
    const patientQuery: any = { _id: patientId };
    if (branchId) {
      patientQuery.branchId = branchId;
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
    const patientQuery: any = { _id: patientId };
    if (branchId) {
      patientQuery.branchId = branchId;
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
    const query: any = { _id: patientId };
    if (branchId) {
      query.branchId = branchId;
    }
    const patient = await this.patientModel.findOne(query).select('walletBalance walletLastUpdated').lean();
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
    const query: any = { _id: patientId };
    if (branchId) {
      query.branchId = branchId;
    }
    const patient = await this.patientModel.findOne(query);
    if (!patient) throw new NotFoundException('Patient not found');
    const balanceBefore = patient.walletBalance || 0;
    patient.walletBalance = balanceBefore + amount;
    patient.walletLastUpdated = new Date();
    await patient.save();
    await this.recordTransaction(
      new Types.ObjectId(patientId),
      WalletTransactionTypeEnum.DEPOSIT,
      amount,
      balanceBefore,
      patient.walletBalance,
      branchId,
      { notes, performedBy: userId, paymentMethod },
    );
    this.realtimeGateway.emitToAll('wallet:updated', { patientId, balance: patient.walletBalance, type: 'deposit', amount, notes, paymentMethod });
    return { patientId, balance: patient.walletBalance, type: 'deposit', amount, notes, paymentMethod, timestamp: new Date() };
  }

  async withdrawFromWallet(patientId: string, amount: number, notes?: string, userId?: string, branchId?: string): Promise<any> {
    if (amount <= 0) throw new BadRequestException('Withdrawal amount must be positive');
    const query: any = { _id: patientId };
    if (branchId) {
      query.branchId = branchId;
    }
    const patient = await this.patientModel.findOne(query);
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
    this.realtimeGateway.emitToAll('wallet:updated', { patientId, balance: patient.walletBalance, type: 'withdrawal', amount, notes });
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
