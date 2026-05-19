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
  ): Promise<Patient> {
    try {
      const patientId = await this.generatePatientId();

      const patient = new this.patientModel({
        ...createPatientDto,
        patientId,
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
  ): Promise<{ data: Patient[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    let query = {};

    if (search) {
      // Search by patient ID, name, or MRN
      query = {
        $or: [
          { patientId: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { mrn: { $regex: search, $options: 'i' } },
        ],
      };
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
  async findOne(id: string): Promise<Patient> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    const patient = await this.patientModel
      .findById(id)
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
  async findByPatientId(patientId: string): Promise<Patient> {
    const patient = await this.patientModel
      .findOne({ patientId })
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
  async search(query: string): Promise<Patient[]> {
    const patients = await this.patientModel
      .find({
        $or: [
          { patientId: { $regex: query, $options: 'i' } },
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { mrn: { $regex: query, $options: 'i' } },
          { phone: { $regex: query, $options: 'i' } },
        ],
      })
      .populate('registeredBy', 'fullName email')
      .limit(1000)
      .exec();

    return patients;
  }

  /**
   * Update patient
   */
  async update(id: string, updatePatientDto: UpdatePatientDto): Promise<Patient> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    try {
      const patient = await this.patientModel
        .findByIdAndUpdate(id, updatePatientDto, { new: true })
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
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    const result = await this.patientModel.findByIdAndDelete(id).exec();

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
  ): Promise<PatientNote> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId).exec();
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
  async getNotes(patientId: string): Promise<PatientNote[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const notes = await this.patientNoteModel
      .find({ patientId: new Types.ObjectId(patientId) })
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    return notes;
  }

  /**
   * Get patient orders
   */
  async getOrders(patientId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Import Order model dynamically to avoid circular dependency
    const Order = this.patientModel.db.model('Order');
    const OrderTest = this.patientModel.db.model('OrderTest');

    const orders = await Order.find({ patientId: new Types.ObjectId(patientId) })
      .populate('orderedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Attach order_tests so callers can display test names/codes
    const ordersWithTests = await Promise.all(
      orders.map(async (order: any) => {
        const tests = await OrderTest.find({ orderId: order._id }).lean().exec();
        return { ...order, order_tests: tests };
      }),
    );

    return ordersWithTests;
  }

  /**
   * Get patient results
   */
  async getResults(patientId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId).exec();
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Get all orders for this patient
    const Order = this.patientModel.db.model('Order');
    const orders = await Order.find({ patientId: new Types.ObjectId(patientId) }).exec();
    const orderIds = orders.map((order: any) => order._id);

    // Get all results for these orders
    const Result = this.patientModel.db.model('Result');
    const results = await Result.find({ orderId: { $in: orderIds } })
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
  async getPatientChart(patientId: string, userRoles: string[] = []): Promise<any> {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Get patient
    const patient = await this.patientModel
      .findById(patientId)
      .populate('registeredBy', 'fullName email')
      .exec();

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Get consultations with SOAP notes
    const Consultation = this.patientModel.db.model('Consultation');
    const consultations = await Consultation.find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Get SOAP notes separately to get vitals
    const SoapNote = this.patientModel.db.model('SoapNote');
    const soapNotes = await SoapNote.find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Get prescriptions with items
    const Prescription = this.patientModel.db.model('Prescription');
    const prescriptions = await Prescription.find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName')
      .populate('dispensedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // Get orders with order tests and results
    const Order = this.patientModel.db.model('Order');
    const OrderTest = this.patientModel.db.model('OrderTest');
    const Result = this.patientModel.db.model('Result');

    const orders = await Order.find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName')
      .populate('orderedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    // For each order, get order tests and results
    const ordersWithDetails = await Promise.all(
      orders.map(async (order: any) => {
        const orderTests = await OrderTest.find({ orderId: order._id })
          .populate('testId')
          .exec();

        const results = await Result.find({ orderId: order._id })
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
    const notes = await this.patientNoteModel
      .find({ patientId: new Types.ObjectId(patientId) })
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    // Get admissions with ward nursing records for follow-up and future reference
    const Admission = this.patientModel.db.model('Admission');
    const admissions = await Admission.find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName department')
      .populate('primaryNurseId', 'fullName')
      .populate('vitalsLog.recordedBy', 'fullName')
      .populate('medicationLog.administeredBy', 'fullName')
      .populate('fluidBalance.recordedBy', 'fullName')
      .populate('nursingNotes.authoredBy', 'fullName')
      .sort({ admittedAt: -1 })
      .exec();

    // Get vitals history from SOAP notes
    const vitalsHistory = soapNotes
      .filter((note: any) => note.vitalSigns)
      .map((note: any) => ({
        date: note.createdAt,
        vitalSigns: note.vitalSigns,
        recordedBy: note.nurseId || note.doctorId,
      }));

    return {
      patient,
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

  async getWalletBalance(patientId: string): Promise<{ patientId: string; balance: number; lastUpdated: Date | null }> {
    const patient = await this.patientModel.findById(patientId).select('walletBalance walletLastUpdated').lean();
    if (!patient) throw new NotFoundException('Patient not found');
    return {
      patientId,
      balance: patient.walletBalance || 0,
      lastUpdated: patient.walletLastUpdated || null,
    };
  }

  async depositToWallet(patientId: string, amount: number, notes?: string): Promise<any> {
    if (amount <= 0) throw new BadRequestException('Deposit amount must be positive');
    const patient = await this.patientModel.findById(patientId);
    if (!patient) throw new NotFoundException('Patient not found');
    patient.walletBalance = (patient.walletBalance || 0) + amount;
    patient.walletLastUpdated = new Date();
    await patient.save();
    this.realtimeGateway.emitToAll('wallet:updated', { patientId, balance: patient.walletBalance, type: 'deposit', amount, notes });
    return { patientId, balance: patient.walletBalance, type: 'deposit', amount, notes, timestamp: new Date() };
  }

  async withdrawFromWallet(patientId: string, amount: number, notes?: string): Promise<any> {
    if (amount <= 0) throw new BadRequestException('Withdrawal amount must be positive');
    const patient = await this.patientModel.findById(patientId);
    if (!patient) throw new NotFoundException('Patient not found');
    const currentBalance = patient.walletBalance || 0;
    if (amount > currentBalance) {
      throw new BadRequestException(`Insufficient wallet balance. Available: Le ${currentBalance.toLocaleString()}`);
    }
    patient.walletBalance = currentBalance - amount;
    patient.walletLastUpdated = new Date();
    await patient.save();
    this.realtimeGateway.emitToAll('wallet:updated', { patientId, balance: patient.walletBalance, type: 'withdrawal', amount, notes });
    return { patientId, balance: patient.walletBalance, type: 'withdrawal', amount, notes, timestamp: new Date() };
  }

  async payFromWallet(patientId: string, amount: number, orderId?: string): Promise<any> {
    return this.withdrawFromWallet(patientId, amount, orderId ? `Payment for order ${orderId}` : 'Order payment');
  }

}
