import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Visit, VisitStatusEnum, VisitTypeEnum } from '../database/schemas/visit.schema';
import { Patient } from '../database/schemas/patient.schema';
import { Doctor } from '../database/schemas/doctor.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { Queue, QueueStatusEnum, PriorityLevelEnum } from '../database/schemas/queue.schema';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';
import { OrderTypeEnum, PriorityEnum, OrderStatusEnum, PaymentStatusEnum } from '../database/schemas/order.schema';

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Queue.name) private queueModel: Model<Queue>,
    private realtimeGateway: RealtimeGateway,
    private ordersService: OrdersService,
  ) {}

  /**
   * Generate unique visit number in format: VIS-YYYYMMDD-XXXX
   */
  private async generateVisitNumber(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const sequenceId = `visit_number_${datePart}`;

    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      {
        $inc: { currentValue: 1 },
        $setOnInsert: { prefix: 'VIS', datePart },
      },
      { upsert: true, new: true },
    );

    const paddedValue = sequence.currentValue.toString().padStart(4, '0');
    return `VIS-${datePart}-${paddedValue}`;
  }

  /**
   * Create a new visit (Reception registers patient)
   */
  async create(createVisitDto: CreateVisitDto): Promise<Visit> {
    const { patientId, doctorId, visitType, consultationFee, chiefComplaint, notes, registeredBy, temperature } = createVisitDto;

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Verify doctor exists if provided
    if (doctorId) {
      const doctor = await this.doctorModel.findById(doctorId);
      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }
    }

    // Generate visit number
    const visitNumber = await this.generateVisitNumber();

    const visit = new this.visitModel({
      visitNumber,
      patientId: new Types.ObjectId(patientId),
      doctorId: doctorId ? new Types.ObjectId(doctorId) : undefined,
      visitType: visitType || VisitTypeEnum.NEW,
      consultationFee,
      chiefComplaint,
      notes,
      temperature: temperature || undefined,
      status: VisitStatusEnum.WAITING_PAYMENT,
      consultationPaid: false,
      registeredBy: registeredBy ? new Types.ObjectId(registeredBy) : undefined,
    });

    const savedVisit = await visit.save();

    // Auto-assign room based on visit type
    if (savedVisit.visitType === VisitTypeEnum.EMERGENCY) {
      const room: any = await this.visitModel.db.model('Room').findOneAndUpdate(
        { roomType: 'emergency', status: 'available' },
        { status: 'occupied', currentVisitId: savedVisit._id, currentPatientName: savedVisit._id },
        { sort: { name: 1 } },
      ).exec();
      if (room) {
        savedVisit.room = room.name;
        savedVisit.roomType = room.roomType;
        await savedVisit.save();
      }
    }
    this.logger.log(`Visit created: ${savedVisit.visitNumber}`);

    // Emit real-time event
    this.realtimeGateway.emitToAll('visit:created', savedVisit);

    return savedVisit;
  }

  /**
   * Find all visits with optional filters
   */
  async findAll(query: any = {}): Promise<Visit[]> {
    return this.visitModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .populate('registeredBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find visit by ID
   */
  async findById(id: string): Promise<Visit> {
    const visit = await this.visitModel
      .findById(id)
      .populate('patientId')
      .populate('doctorId')
      .populate('registeredBy')
      .exec();

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return visit;
  }

  /**
   * Find visits by patient ID
   */
  async findByPatient(patientId: string): Promise<Visit[]> {
    return this.visitModel
      .find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get doctor queue - visits waiting for consultation.
   * If doctorId is provided, returns only visits assigned to that doctor
   * plus unassigned visits (so doctors can see walk-ins with no assignment).
   * Nurses see the full queue regardless.
   */
  async getDoctorQueue(doctorId?: string): Promise<Visit[]> {
    const query: any = {
      status: VisitStatusEnum.IN_QUEUE,
      consultationPaid: true,
    };

    if (doctorId) {
      // Show visits explicitly assigned to this doctor OR unassigned (doctorId not set)
      query.$or = [
        { doctorId: new Types.ObjectId(doctorId) },
        { doctorId: { $exists: false } },
        { doctorId: null },
      ];
    }

    return this.visitModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName department')
      .sort({ triagedAt: 1, createdAt: 1 }) // FCFS after nurse vitals/triage
      .exec();
  }

  /**
   * Get visits awaiting lab payment
   */
  async getAwaitingLabPayment(): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_LAB })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Get visits awaiting pharmacy payment
   */
  async getAwaitingPharmacyPayment(): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_PHARMACY })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Get visits awaiting dispensing (pharmacy paid, pharmacist to dispense)
   */
  async getAwaitingDispensing(): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_DISPENSING })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Get doctor dashboard data — active patients + results ready for a specific doctor
   */
  async getDoctorDashboard(doctorId: string): Promise<{
    waitingQueue: Visit[];
    activePatients: Visit[];
    awaitingLabPayment: Visit[];
    awaitingResults: Visit[];
    awaitingPharmacy: Visit[];
    awaitingDispensing: Visit[];
    awaitingDoctorReview: Visit[];
    admittedPatients: Visit[];
    resultsReady: Visit[];
    incomingReferrals: Visit[];
    todayStats: { seen: number; waiting: number; completed: number };
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const doctorObjectId = new Types.ObjectId(doctorId);

    const openEncounterStatuses = [
      VisitStatusEnum.IN_CONSULTATION,
      VisitStatusEnum.AWAITING_LAB,
      VisitStatusEnum.AWAITING_RESULTS,
      VisitStatusEnum.RESULTS_READY,
      VisitStatusEnum.AWAITING_PHARMACY,
      VisitStatusEnum.AWAITING_DISPENSING,
      VisitStatusEnum.AWAITING_DOCTOR_REVIEW,
      VisitStatusEnum.ADMITTED,
    ];

    const [
      waitingQueue,
      activePatients,
      awaitingLabPayment,
      awaitingResults,
      awaitingPharmacy,
      awaitingDispensing,
      awaitingDoctorReview,
      admittedPatients,
      resultsReady,
      incomingReferrals,
      todaySeen,
      todayWaiting,
      todayCompleted,
    ] =
      await Promise.all([
        // All paid patients waiting in queue (not yet assigned to a doctor)
        this.visitModel
          .find({ status: VisitStatusEnum.IN_QUEUE, consultationPaid: true })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ triagedAt: 1, createdAt: 1 })
          .exec(),
        // This doctor's open encounters stay visible until the doctor closes them.
        this.visitModel
          .find({ status: { $in: openEncounterStatuses }, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions')
          .sort({ updatedAt: -1, consultationStartedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_LAB, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_RESULTS, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_PHARMACY, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_DISPENSING, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_DOCTOR_REVIEW, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.ADMITTED, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        // Patients with results ready for this doctor to review
        this.visitModel
          .find({ status: VisitStatusEnum.RESULTS_READY, doctorId: doctorObjectId })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        // Incoming referrals for this specialist
        this.visitModel
          .find({
            referredToSpecialistId: doctorObjectId,
            status: VisitStatusEnum.REFERRED,
          })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .populate('doctorId', 'fullName department')
          .sort({ referredAt: -1 })
          .exec(),
        // Today's stats
        this.visitModel.countDocuments({
          doctorId: doctorObjectId,
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $in: [...openEncounterStatuses, VisitStatusEnum.COMPLETED] },
        }),
        this.visitModel.countDocuments({
          createdAt: { $gte: today, $lt: tomorrow },
          status: VisitStatusEnum.IN_QUEUE,
        }),
        this.visitModel.countDocuments({
          doctorId: doctorObjectId,
          createdAt: { $gte: today, $lt: tomorrow },
          status: VisitStatusEnum.COMPLETED,
        }),
      ]);

    return {
      waitingQueue,
      activePatients,
      awaitingLabPayment,
      awaitingResults,
      awaitingPharmacy,
      awaitingDispensing,
      awaitingDoctorReview,
      admittedPatients,
      resultsReady,
      incomingReferrals,
      todayStats: {
        seen: todaySeen,
        waiting: todayWaiting,
        completed: todayCompleted,
      },
    };
  }

  /**
   * Reception dashboard — aggregated view of all pending actions + today's stats
   */
  async getReceptionDashboard(): Promise<{
    pendingConsultationPayments: Visit[];
    pendingLabPayments: Visit[];
    pendingPharmacyPayments: Visit[];
    doctorQueue: Visit[];
    todayStats: {
      totalVisits: number;
      consultationsPaid: number;
      awaitingLab: number;
      awaitingPharmacy: number;
      completed: number;
      cancelled: number;
    };
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayFilter = { createdAt: { $gte: today, $lt: tomorrow } };

    const [
      pendingConsultationPayments,
      pendingLabPayments,
      pendingPharmacyPayments,
      doctorQueue,
      totalVisits,
      consultationsPaid,
      awaitingLab,
      awaitingPharmacy,
      completed,
      cancelled,
    ] = await Promise.all([
      this.visitModel
        .find({ status: VisitStatusEnum.WAITING_PAYMENT })
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.AWAITING_LAB })
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .populate('doctorId', 'fullName')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.AWAITING_PHARMACY })
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .populate('doctorId', 'fullName')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.IN_QUEUE, consultationPaid: true })
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .populate('doctorId', 'fullName')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel.countDocuments(todayFilter),
      this.visitModel.countDocuments({ ...todayFilter, consultationPaid: true }),
      this.visitModel.countDocuments({ ...todayFilter, status: VisitStatusEnum.AWAITING_LAB }),
      this.visitModel.countDocuments({ ...todayFilter, status: VisitStatusEnum.AWAITING_PHARMACY }),
      this.visitModel.countDocuments({ ...todayFilter, status: VisitStatusEnum.COMPLETED }),
      this.visitModel.countDocuments({ ...todayFilter, status: VisitStatusEnum.CANCELLED }),
    ]);

    return {
      pendingConsultationPayments,
      pendingLabPayments,
      pendingPharmacyPayments,
      doctorQueue,
      todayStats: {
        totalVisits,
        consultationsPaid,
        awaitingLab,
        awaitingPharmacy,
        completed,
        cancelled,
      },
    };
  }

  /**
   * Update visit
   */
  async update(id: string, updateVisitDto: UpdateVisitDto): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    Object.assign(visit, updateVisitDto);
    const savedVisit = await visit.save();

    this.logger.log(`Visit updated: ${savedVisit.visitNumber} - Status: ${savedVisit.status}`);
    this.realtimeGateway.emitToAll('visit:updated', savedVisit);

    return savedVisit;
  }

  /**
   * Mark consultation as paid and route to nurse vitals/triage.
   */
  async markConsultationPaid(id: string, paymentMethod = 'cash', receivedBy?: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.consultationPaid) {
      throw new BadRequestException('Consultation already paid');
    }

    visit.consultationPaid = true;
    visit.status = VisitStatusEnum.AWAITING_TRIAGE;
    visit.checkedInAt = new Date();

    const savedVisit = await visit.save();
    await this.paymentModel.create({
      visitId: new Types.ObjectId(id),
      paymentType: PaymentTypeEnum.CONSULTATION,
      amount: visit.consultationFee,
      paymentMethod,
      receivedBy: receivedBy ? new Types.ObjectId(receivedBy) : undefined,
      notes: `Consultation payment for visit ${visit.visitNumber}`,
    });
    this.logger.log(`Consultation paid for visit: ${savedVisit.visitNumber} (awaiting triage)`);

    // Auto-create queue entry for nurse triage/vitals.
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      const queueCount = await this.queueModel.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      });
      const lastQueue = await this.queueModel.findOne().sort({ queueOrder: -1 }).exec();
      const queueOrder = lastQueue ? lastQueue.queueOrder + 1 : 1;

      await this.queueModel.create({
        queueNumber: `Q-${dateStr}-${String(queueCount + 1).padStart(4, '0')}`,
        patientId: savedVisit.patientId,
        visitId: savedVisit._id,
        status: QueueStatusEnum.WITH_NURSE,
        priority: PriorityLevelEnum.NORMAL,
        queueOrder,
      });
    } catch (queueErr) {
      this.logger.warn(`Failed to auto-create queue entry for visit ${savedVisit.visitNumber}: ${queueErr}`);
    }

    this.realtimeGateway.emitToAll('visit:consultation_paid', savedVisit);

    return savedVisit;
  }

  /**
   * Nurse triage — record vitals, priority, assign a doctor, and move to doctor queue
   */
  async completeTriage(
    id: string,
    data: {
      temperature?: number;
      bloodPressure?: string;
      heartRate?: number;
      respiratoryRate?: number;
      weight?: number;
      height?: number;
      oxygenSaturation?: number;
      triagePriority?: string;
      triageNotes?: string;
      chiefComplaint?: string;
      doctorId?: string; // Nurse must assign a specific doctor during triage
    },
    nurseId?: string,
  ): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) throw new NotFoundException('Visit not found');

    if (visit.status !== VisitStatusEnum.AWAITING_TRIAGE) {
      throw new BadRequestException('Visit is not awaiting triage');
    }

    if (!data.doctorId) {
      throw new BadRequestException('Doctor selection is required before sending patient to queue');
    }

    if (!Types.ObjectId.isValid(data.doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(data.doctorId);
    if (!doctor) throw new NotFoundException('Doctor not found');

    const { doctorId, ...vitalsAndTriage } = data;

    Object.assign(visit, {
      ...vitalsAndTriage,
      doctorId: new Types.ObjectId(doctorId),
      status: VisitStatusEnum.IN_QUEUE,
      triagedAt: new Date(),
      triagedBy: nurseId ? new Types.ObjectId(nurseId) : undefined,
    });

    const savedVisit = await visit.save();
    this.logger.log(
      `Triage complete for visit: ${savedVisit.visitNumber} - assigned to doctor ${doctorId}`,
    );

    const triagePriority =
      data.triagePriority && (data.triagePriority === 'urgent' || data.triagePriority === 'emergency' || data.triagePriority === 'high')
        ? data.triagePriority === 'emergency'
          ? PriorityLevelEnum.URGENT
          : PriorityLevelEnum[data.triagePriority.toUpperCase()] || PriorityLevelEnum.HIGH
        : undefined;

    await this.queueModel.updateOne(
      { visitId: new Types.ObjectId(id) },
      {
        status: QueueStatusEnum.WAITING,
        ...(triagePriority ? { priority: triagePriority } : {}),
        doctorId: new Types.ObjectId(doctorId),
      },
    );

    this.realtimeGateway.emitToAll('visit:triage_completed', savedVisit);
    return savedVisit;
  }

  /**
   * Nurse assigns (or reassigns) a patient in the queue to a specific doctor.
   * Works on visits in IN_QUEUE status — can be called after triage to redirect a patient.
   */
  async assignDoctorFromQueue(
    id: string,
    doctorId: string,
    nurseId?: string,
  ): Promise<Visit> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const visit = await this.visitModel.findById(id);
    if (!visit) throw new NotFoundException('Visit not found');

    if (visit.status !== VisitStatusEnum.IN_QUEUE) {
      throw new BadRequestException(
        `Cannot reassign doctor — visit is currently '${visit.status}', must be 'in_queue'`,
      );
    }

    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) throw new NotFoundException('Doctor not found');

    const previousDoctorId = visit.doctorId?.toString();
    visit.doctorId = new Types.ObjectId(doctorId);
    const savedVisit = await visit.save();

    // Keep queue entry in sync
    await this.queueModel.updateOne(
      { visitId: new Types.ObjectId(id) },
      { doctorId: new Types.ObjectId(doctorId) },
    );

    this.logger.log(
      `Nurse ${nurseId ?? 'unknown'} reassigned visit ${savedVisit.visitNumber} ` +
        `from doctor ${previousDoctorId ?? 'unassigned'} → ${doctorId}`,
    );

    this.realtimeGateway.emitToAll('visit:doctor_assigned', {
      visit: savedVisit,
      doctorId,
      assignedBy: nurseId,
    });

    return savedVisit;
  }

  /**
   * Get visits awaiting triage
   */
  async getAwaitingTriage(): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_TRIAGE })
      .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Doctor refers patient to a specialist
   */
  async referToSpecialist(
    id: string,
    data: { specialistId: string; reason: string; notes?: string },
    doctorId?: string,
  ): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) throw new NotFoundException('Visit not found');

    visit.referredToSpecialistId = new Types.ObjectId(data.specialistId);
    visit.referralReason = data.reason;
    visit.referralNotes = data.notes;
    visit.referredAt = new Date();
    visit.status = VisitStatusEnum.REFERRED;

    const savedVisit = await visit.save();
    this.logger.log(`Visit ${savedVisit.visitNumber} referred to specialist ${data.specialistId}`);

    this.realtimeGateway.emitToAll('visit:referred', savedVisit);
    return savedVisit;
  }

  /**
   * Get visits referred to a specific specialist (incoming referrals)
   */
  async getSpecialistReferrals(specialistId: string): Promise<Visit[]> {
    return this.visitModel
      .find({
        referredToSpecialistId: new Types.ObjectId(specialistId),
        status: VisitStatusEnum.REFERRED,
      })
      .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions')
      .populate('doctorId', 'fullName department')
      .sort({ referredAt: -1 })
      .exec();
  }

  /**
   * Specialist accepts referral - starts consultation
   */
  async acceptReferral(id: string, specialistId: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.status !== VisitStatusEnum.REFERRED) {
      throw new BadRequestException('Visit is not a referral');
    }

    visit.doctorId = new Types.ObjectId(specialistId);
    visit.status = VisitStatusEnum.IN_CONSULTATION;
    visit.consultationStartedAt = new Date();

    const savedVisit = await visit.save();
    this.logger.log(`Specialist accepted referral: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:accepted', savedVisit);
    return savedVisit;
  }

  /**
   * Doctor accepts patient - start consultation
   */
  async acceptPatient(id: string, doctorId: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.IN_QUEUE) {
      throw new BadRequestException('Visit is not in queue');
    }

    // Auto-assign consultation room if not already assigned
    if (!visit.room) {
      const room: any = await this.visitModel.db.model('Room').findOneAndUpdate(
        { roomType: 'consultation', status: 'available' },
        { status: 'occupied', currentVisitId: visit._id, currentPatientName: visit._id },
        { sort: { name: 1 } },
      ).exec();
      if (room) {
        visit.room = room.name;
        visit.roomType = room.roomType;
      }
    }

    visit.status = VisitStatusEnum.IN_CONSULTATION;
    visit.doctorId = new Types.ObjectId(doctorId);
    visit.consultationStartedAt = new Date();

    const savedVisit = await visit.save();
    this.logger.log(`Doctor accepted visit: ${savedVisit.visitNumber}`);

    await this.queueModel.updateOne(
      { visitId: new Types.ObjectId(id) },
      {
        status: QueueStatusEnum.WITH_DOCTOR,
        doctorId: new Types.ObjectId(doctorId),
        doctorCalledAt: new Date(),
      },
    );

    this.realtimeGateway.emitToAll('visit:accepted', savedVisit);

    return savedVisit;
  }

  /**
   * Doctor orders lab tests - move to awaiting lab payment
   */
  async orderLab(id: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.IN_CONSULTATION) {
      throw new BadRequestException('Visit is not in consultation');
    }

    visit.status = VisitStatusEnum.AWAITING_LAB;
    const savedVisit = await visit.save();

    this.logger.log(`Lab ordered for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:lab_ordered', savedVisit);

    return savedVisit;
  }

  /**
   * Doctor prescribes medication - move to awaiting pharmacy payment
   */
  async prescribeMedication(id: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.IN_CONSULTATION) {
      throw new BadRequestException('Visit is not in consultation');
    }

    visit.status = VisitStatusEnum.AWAITING_PHARMACY;
    const savedVisit = await visit.save();

    this.logger.log(`Medication prescribed for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:pharmacy_ordered', savedVisit);

    return savedVisit;
  }

  /**
   * Lab payment confirmed - move to awaiting results
   */
  async markLabPaid(id: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_LAB) {
      throw new BadRequestException('Visit is not awaiting lab payment');
    }

    visit.status = VisitStatusEnum.AWAITING_RESULTS;
    const savedVisit = await visit.save();

    this.logger.log(`Lab paid for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:lab_paid', savedVisit);

    return savedVisit;
  }

  /**
   * Pharmacy payment confirmed - ready for dispensing
   */
  async markPharmacyPaid(id: string, paymentMethod = 'cash', receivedBy?: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_PHARMACY) {
      throw new BadRequestException('Visit is not awaiting pharmacy payment');
    }

    visit.status = VisitStatusEnum.AWAITING_DISPENSING;
    const savedVisit = await visit.save();

    // Record payment
    await this.paymentModel.create({
      visitId: new Types.ObjectId(id),
      paymentType: PaymentTypeEnum.PRESCRIPTION,
      amount: 0, // Amount tracked on the prescription/order itself
      paymentMethod,
      receivedBy: receivedBy ? new Types.ObjectId(receivedBy) : undefined,
      notes: `Pharmacy payment confirmed for visit ${visit.visitNumber}`,
    });

    this.logger.log(`Pharmacy paid for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:pharmacy_paid', savedVisit);

    return savedVisit;
  }

  /**
   * Pharmacist has dispensed all drugs - return visit to doctor review.
   * The doctor, not pharmacy, closes the encounter.
   */
  async markDispensed(id: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_DISPENSING) {
      throw new BadRequestException('Visit is not awaiting dispensing');
    }

    visit.status = VisitStatusEnum.AWAITING_DOCTOR_REVIEW;
    const savedVisit = await visit.save();

    this.logger.log(`Drugs dispensed, awaiting doctor review: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:dispensed', savedVisit);

    return savedVisit;
  }

  /**
   * Results released - doctor can review
   */
  async resultsReleased(id: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_RESULTS) {
      throw new BadRequestException('Visit is not awaiting results');
    }

    visit.status = VisitStatusEnum.RESULTS_READY;
    const savedVisit = await visit.save();

    this.logger.log(`Results released for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:results_ready', savedVisit);

    return savedVisit;
  }

  /**
   * Complete visit
   */
  async complete(id: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    // Only close encounters from valid doctor-owned closure states.
    if (
      ![
        VisitStatusEnum.IN_CONSULTATION,
        VisitStatusEnum.RESULTS_READY,
        VisitStatusEnum.AWAITING_DOCTOR_REVIEW,
      ].includes(visit.status)
    ) {
      throw new BadRequestException(`Visit cannot be completed from status '${visit.status}'`);
    }

    // Enforce full service settlement for all linked clinical orders before closure.
    const linkedOrders = await this.visitModel.db
      .model('Order')
      .find({
        visitId: visit._id,
        orderType: { $in: [OrderTypeEnum.LAB, OrderTypeEnum.PHARMACY] },
        status: { $ne: OrderStatusEnum.CANCELLED },
      })
      .lean();

    const hasUnpaidOrders = linkedOrders.some(
      (order: any) => order.paymentStatus !== PaymentStatusEnum.PAID,
    );
    if (hasUnpaidOrders) {
      throw new BadRequestException('Visit has unpaid clinical orders');
    }

    const hasUnreleasedLab = linkedOrders.some(
      (order: any) => order.orderType === OrderTypeEnum.LAB && order.status !== OrderStatusEnum.COMPLETED,
    );
    if (hasUnreleasedLab) {
      throw new BadRequestException('Visit has lab orders pending result release');
    }

    const hasUndispensedPharmacy = linkedOrders.some(
      (order: any) => order.orderType === OrderTypeEnum.PHARMACY && order.status !== OrderStatusEnum.COMPLETED,
    );
    if (hasUndispensedPharmacy) {
      throw new BadRequestException('Visit has pharmacy orders pending dispensing');
    }

    // Release room if assigned
    if (visit.room) {
      const RoomModel = this.visitModel.db.model('Room');
      await RoomModel.findOneAndUpdate(
        { name: visit.room },
        { status: 'available', currentVisitId: null, currentPatientName: null },
      ).exec();
    }

    visit.status = VisitStatusEnum.COMPLETED;
    visit.dischargedAt = new Date();

    const savedVisit = await visit.save();
    this.logger.log(`Visit completed: ${savedVisit.visitNumber}`);

    this.realtimeGateway.emitToAll('visit:completed', savedVisit);

    return savedVisit;
  }

  /**
   * Cancel visit
   */
  async cancel(id: string, reason: string, cancelledBy: string): Promise<Visit> {
    const visit = await this.visitModel.findById(id);
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    // Release room if assigned
    if (visit.room) {
      const RoomModel = this.visitModel.db.model('Room');
      await RoomModel.findOneAndUpdate(
        { name: visit.room },
        { status: 'available', currentVisitId: null, currentPatientName: null },
      ).exec();
    }

    visit.status = VisitStatusEnum.CANCELLED;
    visit.cancelledAt = new Date();
    visit.cancelledBy = new Types.ObjectId(cancelledBy);
    visit.cancellationReason = reason;

    const savedVisit = await visit.save();
    this.logger.log(`Visit cancelled: ${savedVisit.visitNumber}`);

    return savedVisit;
  }

  /**
   * Get visit statistics for dashboard
   */
  async getStats(date?: string) {
    const query: any = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const [
      totalVisits,
      waitingPayment,
      awaitingTriage,
      inQueue,
      inConsultation,
      awaitingLab,
      awaitingPharmacy,
      awaitingDispensing,
      awaitingResults,
      resultsReady,
      awaitingDoctorReview,
      admitted,
      completed,
      cancelled,
    ] = await Promise.all([
      this.visitModel.countDocuments(query),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.WAITING_PAYMENT }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.AWAITING_TRIAGE }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.IN_QUEUE }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.IN_CONSULTATION }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.AWAITING_LAB }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.AWAITING_PHARMACY }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.AWAITING_DISPENSING }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.AWAITING_RESULTS }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.RESULTS_READY }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.AWAITING_DOCTOR_REVIEW }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.ADMITTED }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.COMPLETED }),
      this.visitModel.countDocuments({ ...query, status: VisitStatusEnum.CANCELLED }),
    ]);

    return {
      totalVisits,
      waitingPayment,
      awaitingTriage,
      inQueue,
      inConsultation,
      awaitingLab,
      awaitingPharmacy,
      awaitingDispensing,
      awaitingResults,
      resultsReady,
      awaitingDoctorReview,
      admitted,
      completed,
      cancelled,
    };
  }
}
