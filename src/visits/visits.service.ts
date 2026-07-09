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
import { RapidTestResultDto } from './dto/rapid-test-result.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';
import { OrderTypeEnum, PriorityEnum, OrderStatusEnum, PaymentStatusEnum } from '../database/schemas/order.schema';
import { ServicePriceCodeEnum } from '../database/schemas/service-price.schema';
import { ServicePricesService } from '../service-prices/service-prices.service';

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
    private servicePricesService: ServicePricesService,
  ) {}

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

  async create(createVisitDto: CreateVisitDto, branchId?: string): Promise<Visit> {
    const { patientId, doctorId, visitType, consultationFee, chiefComplaint, notes, registeredBy, temperature, serviceType, specialistId, procedureType, rapidTestsRequested } = createVisitDto;

    const patient = await this.patientModel.findById(patientId);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (doctorId) {
      const doctor = await this.doctorModel.findById(doctorId);
      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }
    }

    const visitNumber = await this.generateVisitNumber();

    // When reception books a specialist consultation, default the visit's doctor
    // assignment to that specialist so they show up in their queue automatically.
    // NOTE: visit.doctorId is set from the Doctor collection (specialists) by
    // both this create() and the nurse triage flow.
    const effectiveDoctorId = serviceType === 'specialist_consultation' && specialistId
      ? specialistId
      : doctorId;
    const serviceCode = (serviceType || ServicePriceCodeEnum.NORMAL_CONSULTATION) as ServicePriceCodeEnum;
    const configuredBaseFee = await this.servicePricesService.getPrice(branchId, serviceCode);
    const configuredRapidFee =
      (rapidTestsRequested?.includes('malaria') ? await this.servicePricesService.getPrice(branchId, ServicePriceCodeEnum.RAPID_MALARIA) : 0) +
      (rapidTestsRequested?.includes('typhoid') ? await this.servicePricesService.getPrice(branchId, ServicePriceCodeEnum.RAPID_TYPHOID) : 0);
    const configuredConsultationFee = Math.round((configuredBaseFee + configuredRapidFee) * 100) / 100;

    // Consultation fee waiver: if patient had a paid consultation within 30 days, waive the fee
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentPaidVisit = await this.visitModel.findOne({
      patientId: new Types.ObjectId(patientId),
      consultationPaid: true,
      createdAt: { $gte: thirtyDaysAgo },
    }).sort({ createdAt: -1 }).lean();

    const consultationFeeWaived = !!recentPaidVisit;
    const finalConsultationFee = consultationFeeWaived ? 0 : (configuredConsultationFee || consultationFee);

    const visitData: any = {
      visitNumber,
      patientId: new Types.ObjectId(patientId),
      doctorId: effectiveDoctorId ? new Types.ObjectId(effectiveDoctorId) : undefined,
      visitType: visitType || VisitTypeEnum.NEW,
      consultationFee: finalConsultationFee,
      chiefComplaint,
      notes,
      temperature: temperature || undefined,
      status: consultationFeeWaived ? VisitStatusEnum.AWAITING_TRIAGE : VisitStatusEnum.WAITING_PAYMENT,
      consultationPaid: consultationFeeWaived,
      registeredBy: registeredBy ? new Types.ObjectId(registeredBy) : undefined,
      serviceType,
      specialistId: specialistId ? new Types.ObjectId(specialistId) : undefined,
      procedureType,
      rapidTestsRequested: rapidTestsRequested || [],
      rapidTestResults: [],
    };

    // Snapshot patient insurance onto visit
    const patientObj = patient.toObject ? patient.toObject() : patient;
    if (patientObj.insurance && patientObj.insurance.programCode) {
      visitData.insurance = {
        programCode: patientObj.insurance.programCode,
        subEntityCode: patientObj.insurance.subEntityCode,
        memberNumber: patientObj.insurance.memberNumber,
        memberName: patientObj.insurance.memberName,
        responsiblePerson: patientObj.insurance.responsiblePerson,
        responsiblePhone: patientObj.insurance.responsiblePhone,
      };
    }

    if (branchId) visitData.branchId = branchId;

    const visit = new this.visitModel(visitData);

    const savedVisit = await visit.save();

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
    this.logger.log(`Visit created: ${savedVisit.visitNumber}${consultationFeeWaived ? ' (fee waived — recent paid visit within 30 days)' : ''}`);

    // If fee was waived, auto-create queue entry (skipping the WAITING_PAYMENT step)
    if (consultationFeeWaived) {
      try {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
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
        savedVisit.checkedInAt = new Date();
        await savedVisit.save();
      } catch (e) {
        this.logger.warn(`Failed to auto-create queue entry for waived visit ${savedVisit.visitNumber}: ${e}`);
      }
    }

    this.realtimeGateway.emitToAll('visit:created', savedVisit);

    // Attach waiver flag so the frontend can display it
    const result = savedVisit.toObject();
    return { ...result, consultationFeeWaived } as any;
  }

  async findAll(query: any = {}, branchId?: string): Promise<Visit[]> {
    const filter = branchId ? { ...query, branchId } : query;
    return this.visitModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .populate('registeredBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel
      .findOne({ _id: id, ...(branchId ? { branchId } : {}) })
      .populate('patientId')
      .populate('doctorId')
      .populate('registeredBy')
      .exec();

    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return visit;
  }

  async findByPatient(patientId: string, branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({ patientId: new Types.ObjectId(patientId), ...(branchId ? { branchId } : {}) })
      .populate('doctorId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getDoctorQueue(doctorId?: string, branchId?: string): Promise<Visit[]> {
    const query: any = {
      status: VisitStatusEnum.IN_QUEUE,
      consultationPaid: true,
      ...(branchId ? { branchId } : {}),
    };

    if (doctorId) {
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
      .sort({ triagedAt: 1, createdAt: 1 })
      .exec();
  }

  async getAwaitingLabPayment(branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_LAB, ...(branchId ? { branchId } : {}) })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  async getAwaitingPharmacyPayment(branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_PHARMACY, ...(branchId ? { branchId } : {}) })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  async getAwaitingDispensing(branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_DISPENSING, ...(branchId ? { branchId } : {}) })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  async getDoctorDashboard(doctorId: string, branchId?: string): Promise<{
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
    const branchFilter = branchId
      ? { $or: [{ branchId }, { branchId: { $exists: false } }, { branchId: null }] }
      : {};

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
        this.visitModel
          .find({ status: VisitStatusEnum.IN_QUEUE, consultationPaid: true, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ triagedAt: 1, createdAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: { $in: openEncounterStatuses }, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions')
          .sort({ updatedAt: -1, consultationStartedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_LAB, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_RESULTS, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_PHARMACY, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_DISPENSING, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_DOCTOR_REVIEW, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.ADMITTED, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.RESULTS_READY, doctorId: doctorObjectId, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({
            referredToSpecialistId: doctorObjectId,
            status: VisitStatusEnum.REFERRED,
            ...branchFilter,
          })
          .populate('patientId', 'patientId firstName lastName age gender phone')
          .populate('doctorId', 'fullName department')
          .sort({ referredAt: -1 })
          .exec(),
        this.visitModel.countDocuments({
          doctorId: doctorObjectId,
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $in: [...openEncounterStatuses, VisitStatusEnum.COMPLETED] },
          ...branchFilter,
        }),
        this.visitModel.countDocuments({
          createdAt: { $gte: today, $lt: tomorrow },
          status: VisitStatusEnum.IN_QUEUE,
          ...branchFilter,
        }),
        this.visitModel.countDocuments({
          doctorId: doctorObjectId,
          createdAt: { $gte: today, $lt: tomorrow },
          status: VisitStatusEnum.COMPLETED,
          ...branchFilter,
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

  async getReceptionDashboard(branchId?: string): Promise<{
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
    const todayFilter: any = { createdAt: { $gte: today, $lt: tomorrow } };
    if (branchId) todayFilter.branchId = branchId;

    const branchFilter = branchId
      ? { $or: [{ branchId }, { branchId: { $exists: false } }, { branchId: null }] }
      : {};

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
        .find({ status: VisitStatusEnum.WAITING_PAYMENT, ...branchFilter })
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.AWAITING_LAB, ...branchFilter })
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .populate('doctorId', 'fullName')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.AWAITING_PHARMACY, ...branchFilter })
        .populate('patientId', 'patientId firstName lastName age gender phone')
        .populate('doctorId', 'fullName')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.IN_QUEUE, consultationPaid: true, ...branchFilter })
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

  async update(id: string, updateVisitDto: UpdateVisitDto, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    Object.assign(visit, updateVisitDto);
    const savedVisit = await visit.save();

    this.logger.log(`Visit updated: ${savedVisit.visitNumber} - Status: ${savedVisit.status}`);
    this.realtimeGateway.emitToAll('visit:updated', savedVisit);

    return savedVisit;
  }

  async markConsultationPaid(id: string, paymentMethod = 'cash', receivedBy?: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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
      branchId: branchId ? new Types.ObjectId(branchId) : undefined,
    });
    this.logger.log(`Consultation paid for visit: ${savedVisit.visitNumber} (awaiting triage)`);

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
      doctorId?: string;
      triageAlert?: boolean;
      triageAlerts?: string[];
    },
    nurseId?: string,
    branchId?: string,
  ): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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
    if (visit.consultationFee === undefined || visit.consultationFee === null) {
      visit.consultationFee = 0;
    }

    Object.assign(visit, {
      ...vitalsAndTriage,
      doctorId: new Types.ObjectId(doctorId),
      status: VisitStatusEnum.IN_QUEUE,
      triagedAt: new Date(),
      triagedBy: nurseId ? new Types.ObjectId(nurseId) : undefined,
      triageAlert: data.triageAlerts && data.triageAlerts.length > 0 ? true : !!data.triageAlert,
      triageAlerts: data.triageAlerts || [],
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
   * Add an in-house rapid test result (malaria/typhoid) to a visit.
   * These tests are NOT routed to LIS — the nurse performs the bedside
   * test and the result lives in the EMR for the doctor to review.
   */
  async addRapidTestResult(
    id: string,
    data: RapidTestResultDto,
    nurseId?: string,
    branchId?: string,
  ): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
    if (!visit) throw new NotFoundException('Visit not found');

    if (data.testType === 'typhoid' && data.parasiteCount != null) {
      throw new BadRequestException('Parasite count is only valid for malaria tests');
    }

    const entry = {
      testType: data.testType,
      result: data.result,
      parasiteCount: data.parasiteCount,
      antigen: data.antigen,
      notes: data.notes,
      performedBy: nurseId ? new Types.ObjectId(nurseId) : undefined,
      performedAt: new Date(),
    } as any;

    visit.rapidTestResults = visit.rapidTestResults || [];
    visit.rapidTestResults.push(entry);
    const saved = await visit.save();
    this.logger.log(
      `Rapid ${data.testType} test (${data.result}) added to visit ${saved.visitNumber}`,
    );
    this.realtimeGateway.emitToAll('visit:rapid_test_result_added', saved);
    return saved;
  }

  async assignDoctorFromQueue(
    id: string,
    doctorId: string,
    nurseId?: string,
    branchId?: string,
  ): Promise<Visit> {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }

    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async getAwaitingTriage(branchId?: string): Promise<Visit[]> {
    const query: any = { status: VisitStatusEnum.AWAITING_TRIAGE };
    if (branchId) {
      query.$or = [{ branchId }, { branchId: { $exists: false } }, { branchId: null }];
    }
    return this.visitModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions')
      .sort({ createdAt: 1 })
      .exec();
  }

  async backfillMissingBranchId(branchId: string) {
    return this.visitModel.updateMany(
      { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
      { $set: { branchId } },
    ).exec();
  }

  async referToSpecialist(
    id: string,
    data: { specialistId: string; reason: string; notes?: string },
    doctorId?: string,
    branchId?: string,
  ): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async getSpecialistReferrals(specialistId: string, branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({
        referredToSpecialistId: new Types.ObjectId(specialistId),
        status: VisitStatusEnum.REFERRED,
        ...(branchId ? { branchId } : {}),
      })
      .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions')
      .populate('doctorId', 'fullName department')
      .sort({ referredAt: -1 })
      .exec();
  }

  async acceptReferral(id: string, specialistId: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async acceptPatient(id: string, doctorId: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.IN_QUEUE) {
      throw new BadRequestException('Visit is not in queue');
    }

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

  async orderLab(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async prescribeMedication(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async markLabPaid(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async markPharmacyPaid(id: string, paymentMethod = 'cash', receivedBy?: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_PHARMACY) {
      throw new BadRequestException('Visit is not awaiting pharmacy payment');
    }

    visit.status = VisitStatusEnum.AWAITING_DISPENSING;
    const savedVisit = await visit.save();

    await this.paymentModel.create({
      visitId: new Types.ObjectId(id),
      paymentType: PaymentTypeEnum.PRESCRIPTION,
      amount: 0,
      paymentMethod,
      receivedBy: receivedBy ? new Types.ObjectId(receivedBy) : undefined,
      notes: `Pharmacy payment confirmed for visit ${visit.visitNumber}`,
    });

    this.logger.log(`Pharmacy paid for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToAll('visit:pharmacy_paid', savedVisit);

    return savedVisit;
  }

  async markDispensed(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async resultsReleased(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
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

  async complete(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (
      ![
        VisitStatusEnum.IN_CONSULTATION,
        VisitStatusEnum.RESULTS_READY,
        VisitStatusEnum.AWAITING_DOCTOR_REVIEW,
      ].includes(visit.status)
    ) {
      throw new BadRequestException(`Visit cannot be completed from status '${visit.status}'`);
    }

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

  async cancel(id: string, reason: string, cancelledBy: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

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

  async getStats(date?: string, branchId?: string) {
    const query: any = {};
    if (branchId) query.branchId = branchId;
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

  async getDoctorPatients(
    doctorId: string,
    branchId?: string,
    page = 1,
    limit = 50,
    search = '',
    daysBack?: number,
  ): Promise<{ patients: any[]; total: number; page: number; limit: number }> {
    const doctorObjectId = new Types.ObjectId(doctorId);
    const branchFilter = branchId
      ? { $or: [{ branchId: new Types.ObjectId(branchId) }, { branchId: { $exists: false } }, { branchId: null }] }
      : {};

    const matchStage: any = { doctorId: doctorObjectId, ...branchFilter };
    if (daysBack && daysBack > 0) {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);
      since.setHours(0, 0, 0, 0);
      matchStage.createdAt = { $gte: since };
    }

    const pipeline: any[] = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$patientId',
          lastVisitId: { $first: '$_id' },
          lastVisitNumber: { $first: '$visitNumber' },
          lastVisitStatus: { $first: '$status' },
          lastVisitDate: { $first: '$createdAt' },
          lastChiefComplaint: { $first: '$chiefComplaint' },
          totalVisits: { $sum: 1 },
        },
      },
      { $sort: { lastVisitDate: -1 } },
      {
        $lookup: {
          from: 'patients',
          localField: '_id',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: '$patient' },
    ];

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'patient.firstName': regex },
            { 'patient.lastName': regex },
            { 'patient.patientId': regex },
            { 'patient.phone': regex },
            { 'patient.email': regex },
          ],
        },
      });
    }

    const totalPipeline = [...pipeline, { $count: 'total' }];
    const totalResult = await this.visitModel.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;

    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });
    pipeline.push({
      $project: {
        _id: '$patient._id',
        patientId: '$patient.patientId',
        firstName: '$patient.firstName',
        lastName: '$patient.lastName',
        age: '$patient.age',
        ageUnit: '$patient.ageUnit',
        gender: '$patient.gender',
        phone: '$patient.phone',
        email: '$patient.email',
        address: '$patient.address',
        allergies: '$patient.allergies',
        chronicConditions: '$patient.chronicConditions',
        lastVisitId: 1,
        lastVisitNumber: 1,
        lastVisitStatus: 1,
        lastVisitDate: 1,
        lastChiefComplaint: 1,
        totalVisits: 1,
      },
    });

    const patients = await this.visitModel.aggregate(pipeline);

    return { patients, total, page, limit };
  }

  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Visit with ID ${id} not found`);
    }
    const result = await this.visitModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Visit with ID ${id} not found`);
    }
  }
}
