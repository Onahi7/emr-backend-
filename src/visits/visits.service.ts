import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ConsultationCoverageTypeEnum, Visit, VisitStatusEnum, VisitTypeEnum } from '../database/schemas/visit.schema';
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
import { InsuranceBlock } from '../database/schemas/insurance-block.schema';
import { requireBranchId, branchFilter, branchFilterOptional, withBranch } from '../common/utils/branch-scope';
import { SoapNote, SoapNoteTypeEnum } from '../database/schemas/soap-note.schema';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { ClinicalVisitDraftDto, CompleteVisitDto } from './dto/clinical-visit-draft.dto';
import { InsuranceClaimsService } from '../insurance/insurance-claims.service';

interface ClinicalVisitActor {
  userId: string;
  doctorId?: string;
  roles?: string[];
}

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
    @InjectModel(InsuranceBlock.name) private insuranceBlockModel: Model<InsuranceBlock>,
    @InjectModel(SoapNote.name) private soapNoteModel: Model<SoapNote>,
    private realtimeGateway: RealtimeGateway,
    private ordersService: OrdersService,
    private servicePricesService: ServicePricesService,
    private insuranceClaimsService: InsuranceClaimsService,
  ) {}

  private async isSystemDoctor(doctorId: string): Promise<boolean> {
    try {
      const doc = await this.doctorModel.findById(doctorId).select('isSystemDoctor').lean();
      return !!(doc as any)?.isSystemDoctor;
    } catch {
      return false;
    }
  }

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

  private async assertClinicalVisitAccess(visit: Visit, actor: ClinicalVisitActor): Promise<void> {
    if (!visit.consultationPaid) {
      throw new ForbiddenException('Consultation payment or coverage is required before clinical documentation');
    }
    if ([VisitStatusEnum.COMPLETED, VisitStatusEnum.CANCELLED].includes(visit.status)) {
      throw new ConflictException('Closed visits cannot be clinically edited');
    }
    if (actor.roles?.includes(UserRoleEnum.ADMIN)) return;
    if (!visit.doctorId) throw new ForbiddenException('This visit has no treating doctor assigned');

    const assignedDoctorId = visit.doctorId.toString();
    // Some legacy encounters were assigned directly to the authenticated Profile ID
    // because the account did not yet have a linked Doctor record. Keep those usable
    // without allowing a different authenticated user to claim them.
    if (assignedDoctorId === actor.doctorId || assignedDoctorId === actor.userId) return;

    // Resolve the current link at write time as well as trusting the signed JWT. This
    // keeps a doctor productive after an administrator links their Doctor record while
    // an older access token is still active, and remains strictly branch-scoped.
    const linkedDoctor = await this.doctorModel
      .findOne(withBranch({ userId: new Types.ObjectId(actor.userId), isActive: true }, visit.branchId.toString()))
      .select('_id')
      .lean()
      .exec();
    if (linkedDoctor?._id?.toString() === assignedDoctorId) return;

    throw new ForbiddenException('This visit belongs to another treating doctor');
  }

  private applyClinicalVisitFields(visit: Visit, dto: ClinicalVisitDraftDto): void {
    const visitFields: Array<keyof ClinicalVisitDraftDto> = [
      'chiefComplaint', 'temperature', 'bloodPressure', 'heartRate', 'respiratoryRate',
      'weight', 'height', 'oxygenSaturation', 'triageOverridePriority',
      'doctorTriageNotes', 'problemList',
    ];
    for (const field of visitFields) {
      if (dto[field] !== undefined) (visit as any)[field] = dto[field];
    }
  }

  private async persistCanonicalSoap(
    visit: Visit,
    dto: ClinicalVisitDraftDto,
    branchId: string,
    actor: ClinicalVisitActor,
    session: ClientSession,
    sign: boolean,
  ): Promise<SoapNote> {
    const note = await this.soapNoteModel
      .findOne({ visitId: visit._id, addendumTo: { $exists: false } })
      .sort({ updatedAt: -1 })
      .session(session);

    if (note?.branchId && note.branchId.toString() !== branchId) {
      throw new ForbiddenException('SOAP note belongs to another branch');
    }
    if (note?.isSigned) {
      throw new ConflictException('Signed SOAP notes are immutable; create an addendum instead');
    }

    const hasClinicalNarrative = [
      dto.chiefComplaint,
      dto.subjectiveNotes,
      dto.objectiveNotes,
      dto.assessmentNotes,
      dto.planNotes,
      dto.diagnosis,
    ].some((value) => typeof value === 'string' && value.trim().length > 0);
    if (sign && !note && !hasClinicalNarrative) {
      throw new BadRequestException('A clinical note is required before completing the visit');
    }

    const vitalSigns = {
      temperature: dto.temperature,
      bloodPressure: dto.bloodPressure,
      heartRate: dto.heartRate,
      respiratoryRate: dto.respiratoryRate,
      oxygenSaturation: dto.oxygenSaturation,
      weight: dto.weight,
      height: dto.height,
    };
    const patch: Record<string, any> = {
      branchId: new Types.ObjectId(branchId),
      patientId: visit.patientId,
      visitId: visit._id,
      doctorId: visit.doctorId || (actor.doctorId ? new Types.ObjectId(actor.doctorId) : undefined),
      noteType: SoapNoteTypeEnum.CONSULTATION,
      updatedBy: new Types.ObjectId(actor.userId),
    };
    if (dto.chiefComplaint !== undefined) patch.chiefComplaint = dto.chiefComplaint;
    if (dto.subjectiveNotes !== undefined) patch.historyPresentIllness = dto.subjectiveNotes;
    if (dto.objectiveNotes !== undefined) patch.physicalExamination = dto.objectiveNotes;
    if (dto.assessmentNotes !== undefined) patch.assessment = dto.assessmentNotes;
    if (dto.diagnosis !== undefined) patch.diagnosis = dto.diagnosis;
    if (dto.planNotes !== undefined) {
      patch.treatmentPlan = dto.planNotes;
      patch.followUpInstructions = dto.planNotes;
    }
    if (Object.values(vitalSigns).some((value) => value !== undefined)) patch.vitalSigns = vitalSigns;
    if (sign) {
      patch.isSigned = true;
      patch.signedAt = new Date();
      patch.signedBy = new Types.ObjectId(actor.userId);
    }

    if (note) {
      Object.assign(note, patch);
      return note.save({ session });
    }
    const created = new this.soapNoteModel({
      ...patch,
      createdBy: new Types.ObjectId(actor.userId),
      isSigned: sign,
    });
    return created.save({ session });
  }

  private async hydrateCanonicalSoap(visits: Visit[], branchId: string): Promise<void> {
    if (visits.length === 0) return;
    const visitIds = visits.map((visit) => visit._id);
    const notes = await this.soapNoteModel
      .find({
        visitId: { $in: visitIds },
        addendumTo: { $exists: false },
        $or: [{ branchId: new Types.ObjectId(branchId) }, { branchId: { $exists: false } }],
      })
      .sort({ updatedAt: -1 })
      .lean();
    const byVisit = new Map<string, any>();
    for (const note of notes) {
      const key = note.visitId?.toString();
      if (key && !byVisit.has(key)) byVisit.set(key, note);
    }
    for (const visit of visits) {
      const note = byVisit.get(visit._id.toString());
      if (!note) continue;
      visit.subjectiveNotes = note.historyPresentIllness ?? visit.subjectiveNotes;
      visit.objectiveNotes = note.physicalExamination ?? visit.objectiveNotes;
      visit.assessmentNotes = note.assessment ?? visit.assessmentNotes;
      visit.planNotes = note.treatmentPlan ?? visit.planNotes;
      visit.diagnosis = note.diagnosis ?? visit.diagnosis;
      visit.chiefComplaint = note.chiefComplaint ?? visit.chiefComplaint;
      (visit as any).soapNoteId = note._id;
      (visit as any).soapNoteSigned = note.isSigned === true;
    }
  }

  private async findActiveInsuranceBlock(patientId?: string, memberNumber?: string, programCode?: string, branchId?: string) {
    if (!programCode || (!patientId && !memberNumber)) return null;

    const query: any = {
      ...withBranch({}, branchId),
      isActive: true,
      programCode,
      $or: [],
    };

    if (patientId && Types.ObjectId.isValid(patientId)) {
      query.$or.push({ patientId: new Types.ObjectId(patientId) });
    }
    if (memberNumber) {
      query.$or.push({ memberNumber });
    }

    if (query.$or.length === 0) return null;
    return this.insuranceBlockModel.findOne(query).lean().exec();
  }

  async getInsuranceEligibility(patientId: string, branchId?: string) {
    const requiredBranchId = requireBranchId(branchId);
    if (!Types.ObjectId.isValid(patientId)) {
      throw new NotFoundException('Patient not found');
    }

    const patient = await this.patientModel
      .findOne(withBranch({ _id: patientId }, requiredBranchId))
      .select('patientId firstName lastName insurance')
      .lean();
    if (!patient) throw new NotFoundException('Patient not found');

    const insurance = (patient as any).insurance;
    if (!insurance?.programCode) {
      return {
        patientId,
        hasInsurance: false,
        status: 'self_pay',
        eligible: false,
        reason: 'No insurance membership is recorded for this patient.',
      };
    }

    const block = await this.findActiveInsuranceBlock(
      patientId,
      insurance.memberNumber,
      insurance.programCode,
      requiredBranchId,
    );
    if (block) {
      return {
        patientId,
        hasInsurance: true,
        status: 'blocked',
        eligible: false,
        insurance,
        reason: (block as any).reasonDetail || (block as any).reason || 'Insurance coverage is blocked.',
        block,
      };
    }

    const lastCoveredVisit = await this.visitModel.findOne({
      branchId: new Types.ObjectId(requiredBranchId),
      patientId: new Types.ObjectId(patientId),
      consultationCoverageType: ConsultationCoverageTypeEnum.INSURANCE,
      status: { $ne: VisitStatusEnum.CANCELLED },
    }).select('visitNumber createdAt').sort({ createdAt: -1 }).lean();

    if (lastCoveredVisit?.createdAt) {
      const nextEligibleAt = new Date(lastCoveredVisit.createdAt);
      nextEligibleAt.setDate(nextEligibleAt.getDate() + 14);
      if (nextEligibleAt.getTime() > Date.now()) {
        return {
          patientId,
          hasInsurance: true,
          status: 'waiting_period',
          eligible: false,
          insurance,
          lastCoveredVisitAt: lastCoveredVisit.createdAt,
          nextEligibleAt,
          reason: 'Insurance consultation is still inside the 14-day interval.',
        };
      }
    }

    return {
      patientId,
      hasInsurance: true,
      status: 'eligible',
      eligible: true,
      insurance,
      lastCoveredVisitAt: lastCoveredVisit?.createdAt,
      reason: 'Insurance consultation is eligible now.',
    };
  }

  async create(createVisitDto: CreateVisitDto, branchId?: string): Promise<Visit> {
    const requiredBranchId = requireBranchId(branchId);
    const { patientId, doctorId, visitType, consultationFee, chiefComplaint, notes, registeredBy, temperature, serviceType, specialistId, procedureType, rapidTestsRequested } = createVisitDto;

    const patient = await this.patientModel.findOne(withBranch({ _id: patientId }, requiredBranchId));
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (doctorId) {
      const doctor = await this.doctorModel.findOne(withBranch({ _id: doctorId }, requiredBranchId));
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

    // Insurance visits are covered once every 14 days. A patient may still be
    // registered earlier, but reception must explicitly select self-pay.
    const patientObj = patient.toObject ? patient.toObject() : patient;
    const hasInsurance = !!(patientObj as any).insurance?.programCode;
    const insuranceBlock = hasInsurance
      ? await this.findActiveInsuranceBlock(
        patientId,
        (patientObj as any).insurance?.memberNumber,
        (patientObj as any).insurance?.programCode,
        requiredBranchId,
      )
      : null;

    if (insuranceBlock && !createVisitDto.selfPayOverride) {
      throw new BadRequestException('Insurance coverage is blocked for this patient. Use self-pay override to register the visit.');
    }

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const recentInsuranceVisit = hasInsurance && !createVisitDto.selfPayOverride
      ? await this.visitModel.findOne({
        branchId: new Types.ObjectId(requiredBranchId),
        patientId: new Types.ObjectId(patientId),
        consultationCoverageType: ConsultationCoverageTypeEnum.INSURANCE,
        status: { $ne: VisitStatusEnum.CANCELLED },
        createdAt: { $gte: fourteenDaysAgo },
      }).sort({ createdAt: -1 }).lean()
      : null;

    if (recentInsuranceVisit) {
      throw new BadRequestException('Insurance covers one consultation every 14 days. Register this visit as self-pay to continue before the next eligible date.');
    }

    const consultationCoveredByInsurance = hasInsurance && !insuranceBlock && !createVisitDto.selfPayOverride;

    // A paid normal consultation covers that visit plus one subsequent visit.
    // Legacy paid visits are recognised by their non-zero consultation fee.
    const paidEntitlement = !hasInsurance || createVisitDto.selfPayOverride
      ? await this.visitModel.findOne({
        branchId: new Types.ObjectId(requiredBranchId),
        patientId: new Types.ObjectId(patientId),
        status: { $ne: VisitStatusEnum.CANCELLED },
        $or: [
          { consultationCoverageType: ConsultationCoverageTypeEnum.PAID },
          {
            consultationCoverageType: { $exists: false },
            consultationPaid: true,
            consultationFee: { $gt: 0 },
          },
        ],
      }).sort({ createdAt: -1 }).lean()
      : null;
    const visitsOnEntitlement = paidEntitlement
      ? await this.visitModel.countDocuments({
        branchId: new Types.ObjectId(requiredBranchId),
        patientId: new Types.ObjectId(patientId),
        status: { $ne: VisitStatusEnum.CANCELLED },
        createdAt: { $gte: paidEntitlement.createdAt },
      })
      : 0;
    const consultationFeeWaived = (!hasInsurance || !!createVisitDto.selfPayOverride)
      && !!paidEntitlement
      && visitsOnEntitlement < 2;

    // Follow-up waive zeros the fee. Insurance keeps the configured fee for AR/claim tracking
    // (patient still pays nothing — consultationPaid + coverageType handle that).
    const finalConsultationFee = consultationFeeWaived
      ? 0
      : (configuredConsultationFee || consultationFee || 0);

    const visitData: any = {
      branchId: new Types.ObjectId(requiredBranchId),
      visitNumber,
      patientId: new Types.ObjectId(patientId),
      doctorId: effectiveDoctorId ? new Types.ObjectId(effectiveDoctorId) : undefined,
      visitType: visitType || VisitTypeEnum.NEW,
      consultationFee: finalConsultationFee,
      chiefComplaint,
      notes,
      temperature: temperature || undefined,
      status: (consultationFeeWaived || consultationCoveredByInsurance) ? VisitStatusEnum.AWAITING_TRIAGE : VisitStatusEnum.WAITING_PAYMENT,
      consultationPaid: consultationFeeWaived || consultationCoveredByInsurance,
      consultationPaymentMethod: consultationCoveredByInsurance ? 'insurance' : undefined,
      consultationCoverageType: consultationCoveredByInsurance
        ? ConsultationCoverageTypeEnum.INSURANCE
        : consultationFeeWaived
          ? ConsultationCoverageTypeEnum.FOLLOW_UP
          : ConsultationCoverageTypeEnum.PENDING,
      registeredBy: registeredBy ? new Types.ObjectId(registeredBy) : undefined,
      serviceType,
      specialistId: specialistId ? new Types.ObjectId(specialistId) : undefined,
      procedureType,
      rapidTestsRequested: rapidTestsRequested || [],
      rapidTestResults: [],
    };

    // Always snapshot patient insurance so labs/pharmacy can still be billed to
    // insurance even when the consultation itself is self-pay / waiting-period.
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

    const visit = new this.visitModel(visitData);

    const savedVisit = await visit.save();

    if (savedVisit.visitType === VisitTypeEnum.EMERGENCY) {
      const room: any = await this.visitModel.db.model('Room').findOneAndUpdate(
        withBranch({ roomType: 'emergency', status: 'available' }, requiredBranchId),
        { status: 'occupied', currentVisitId: savedVisit._id, currentPatientName: savedVisit._id },
        { sort: { name: 1 } },
      ).exec();
      if (room) {
        savedVisit.room = room.name;
        savedVisit.roomType = room.roomType;
        await savedVisit.save();
      }
    }
    this.logger.log(`Visit created: ${savedVisit.visitNumber}${consultationFeeWaived ? ' (included follow-up visit)' : ''}${consultationCoveredByInsurance ? ' (consultation covered by insurance)' : ''}`);

    // Create claim + receivable payment so consultation AR is trackable.
    if (consultationCoveredByInsurance && finalConsultationFee > 0) {
      try {
        await this.insuranceClaimsService.recordConsultationInsuranceCoverage(
          savedVisit,
          finalConsultationFee,
          registeredBy,
          requiredBranchId,
        );
      } catch (e) {
        this.logger.warn(`Failed to create consultation insurance claim for ${savedVisit.visitNumber}: ${e}`);
      }
    }

    // Included follow-ups and covered insurance visits skip the payment step.
    if (consultationFeeWaived || consultationCoveredByInsurance) {
      try {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const queueCount = await this.queueModel.countDocuments({
          branchId: new Types.ObjectId(requiredBranchId),
          createdAt: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        });
        const lastQueue = await this.queueModel.findOne({ branchId: new Types.ObjectId(requiredBranchId) }).sort({ queueOrder: -1 }).exec();
        const queueOrder = lastQueue ? lastQueue.queueOrder + 1 : 1;
        await this.queueModel.create({
          branchId: new Types.ObjectId(requiredBranchId),
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
        this.logger.warn(`Failed to auto-create queue entry for covered visit ${savedVisit.visitNumber}: ${e}`);
      }
    }

    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:created', savedVisit);

    // Attach waiver/insurance flags so the frontend can display them
    const result = savedVisit.toObject();
    return { ...result, consultationFeeWaived, consultationCoveredByInsurance } as any;
  }

  async findAll(query: any = {}, branchId?: string): Promise<Visit[]> {
    const filter = branchId ? { ...query, branchId } : query;
    return this.visitModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName age gender phone insurance')
      .populate('doctorId', 'fullName')
      .populate('registeredBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel
      .findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) })
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
      .find({ patientId: new Types.ObjectId(patientId), ...branchFilterOptional(branchId) })
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
      .populate('patientId', 'patientId firstName lastName age gender phone insurance')
      .populate('doctorId', 'fullName department')
      .sort({ triagedAt: 1, createdAt: 1 })
      .exec();
  }

  async getAwaitingLabPayment(branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_LAB, ...(branchId ? { branchId } : {}) })
      .populate('patientId', 'patientId firstName lastName age gender phone insurance')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  async getAwaitingPharmacyPayment(branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_PHARMACY, ...(branchId ? { branchId } : {}) })
      .populate('patientId', 'patientId firstName lastName age gender phone insurance')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  async getAwaitingDispensing(branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({ status: VisitStatusEnum.AWAITING_DISPENSING, ...(branchId ? { branchId } : {}) })
      .populate('patientId', 'patientId firstName lastName age gender phone insurance')
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
    const branchFilter = withBranch({}, branchId);
    const systemDoctor = await this.isSystemDoctor(doctorId);

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

    // System doctors (admin doctor mode) see ALL patients in the branch, not just their own
    const doctorFilter = systemDoctor ? {} : { doctorId: doctorObjectId };

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
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ triagedAt: 1, createdAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: { $in: openEncounterStatuses }, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions insurance')
          .sort({ updatedAt: -1, consultationStartedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_LAB, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_RESULTS, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_PHARMACY, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_DISPENSING, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.AWAITING_DOCTOR_REVIEW, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.ADMITTED, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({ status: VisitStatusEnum.RESULTS_READY, ...doctorFilter, ...branchFilter })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .sort({ updatedAt: 1 })
          .exec(),
        this.visitModel
          .find({
            ...(systemDoctor ? {} : { referredToSpecialistId: doctorObjectId }),
            status: VisitStatusEnum.REFERRED,
            ...branchFilter,
          })
          .populate('patientId', 'patientId firstName lastName age gender phone insurance')
          .populate('doctorId', 'fullName department')
          .sort({ referredAt: -1 })
          .exec(),
        this.visitModel.countDocuments({
          ...doctorFilter,
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
          ...doctorFilter,
          createdAt: { $gte: today, $lt: tomorrow },
          status: VisitStatusEnum.COMPLETED,
          ...branchFilter,
        }),
      ]);

    await this.hydrateCanonicalSoap(activePatients, requireBranchId(branchId));

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
    const todayFilter = withBranch({ createdAt: { $gte: today, $lt: tomorrow } }, branchId);
    const branchFilter = withBranch({}, branchId);

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
        .populate('patientId', 'patientId firstName lastName age gender phone insurance')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.AWAITING_LAB, ...branchFilter })
        .populate('patientId', 'patientId firstName lastName age gender phone insurance')
        .populate('doctorId', 'fullName')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.AWAITING_PHARMACY, ...branchFilter })
        .populate('patientId', 'patientId firstName lastName age gender phone insurance')
        .populate('doctorId', 'fullName')
        .sort({ createdAt: 1 })
        .exec(),
      this.visitModel
        .find({ status: VisitStatusEnum.IN_QUEUE, consultationPaid: true, ...branchFilter })
        .populate('patientId', 'patientId firstName lastName age gender phone insurance')
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
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    Object.assign(visit, updateVisitDto);
    const savedVisit = await visit.save();

    this.logger.log(`Visit updated: ${savedVisit.visitNumber} - Status: ${savedVisit.status}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:updated', savedVisit);

    return savedVisit;
  }

  async updateClinicalDraft(
    id: string,
    dto: ClinicalVisitDraftDto,
    actor: ClinicalVisitActor,
    branchId?: string,
  ): Promise<{ visit: Visit; soapNote: SoapNote }> {
    const requiredBranchId = requireBranchId(branchId);
    const session = await this.visitModel.db.startSession();
    let result: { visit: Visit; soapNote: SoapNote } | undefined;
    try {
      await session.withTransaction(async () => {
        const visit = await this.visitModel
          .findOne(withBranch({ _id: new Types.ObjectId(id) }, requiredBranchId))
          .session(session);
        if (!visit) throw new NotFoundException('Visit not found');
        await this.assertClinicalVisitAccess(visit, actor);
        this.applyClinicalVisitFields(visit, dto);
        const soapNote = await this.persistCanonicalSoap(visit, dto, requiredBranchId, actor, session, false);
        const savedVisit = await visit.save({ session });
        result = { visit: savedVisit, soapNote };
      });
    } finally {
      await session.endSession();
    }
    if (!result) throw new ConflictException('Clinical draft could not be saved');
    this.realtimeGateway.emitToBranch(requiredBranchId, 'visit:updated', result.visit);
    return result;
  }

  async markConsultationPaid(id: string, paymentMethod = 'cash', receivedBy?: string, branchId?: string): Promise<Visit> {
    const requiredBranchId = requireBranchId(branchId);
    const visit = await this.visitModel.findOne(withBranch({ _id: new Types.ObjectId(id) }, requiredBranchId));
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.consultationPaid) {
      throw new BadRequestException('Consultation already paid');
    }

    visit.consultationPaid = true;
    visit.consultationPaymentMethod = paymentMethod;
    visit.consultationCoverageType = ConsultationCoverageTypeEnum.PAID;
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
      branchId: new Types.ObjectId(requiredBranchId),
    });
    this.logger.log(`Consultation paid for visit: ${savedVisit.visitNumber} (awaiting triage)`);

    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      const queueCount = await this.queueModel.countDocuments({
        branchId: new Types.ObjectId(requiredBranchId),
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      });
      const lastQueue = await this.queueModel.findOne({ branchId: new Types.ObjectId(requiredBranchId) }).sort({ queueOrder: -1 }).exec();
      const queueOrder = lastQueue ? lastQueue.queueOrder + 1 : 1;

      await this.queueModel.create({
        branchId: new Types.ObjectId(requiredBranchId),
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

    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:consultation_paid', savedVisit);

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
      rapidTestsRequested?: ('malaria' | 'typhoid')[];
    },
    nurseId?: string,
    branchId?: string,
  ): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
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
    const doctor = await this.doctorModel.findOne(withBranch({ _id: data.doctorId }, branchId));
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

    // If nurse selected rapid tests, record them on the visit and add fees
    if (data.rapidTestsRequested && data.rapidTestsRequested.length > 0) {
      const requiredBranchId = branchId?.toString() || savedVisit.branchId?.toString();
      let rdtFee = 0;
      for (const testType of data.rapidTestsRequested) {
        const priceCode = testType === 'malaria'
          ? ServicePriceCodeEnum.RAPID_MALARIA
          : ServicePriceCodeEnum.RAPID_TYPHOID;
        const price = requiredBranchId
          ? await this.servicePricesService.getPrice(requiredBranchId, priceCode)
          : (testType === 'malaria' ? 50 : 50);
        rdtFee += price;
      }
      savedVisit.rapidTestsRequested = data.rapidTestsRequested;
      savedVisit.consultationFee = Math.round(((savedVisit.consultationFee || 0) + rdtFee) * 100) / 100;
      await savedVisit.save();
      this.logger.log(
        `Rapid tests [${data.rapidTestsRequested.join(', ')}] added to visit ${savedVisit.visitNumber} (+Le ${rdtFee})`,
      );
    }

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

    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:triage_completed', savedVisit);
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
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
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
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'visit:rapid_test_result_added', saved);
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

    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) throw new NotFoundException('Visit not found');

    if (visit.status !== VisitStatusEnum.IN_QUEUE) {
      throw new BadRequestException(
        `Cannot reassign doctor — visit is currently '${visit.status}', must be 'in_queue'`,
      );
    }

    const doctor = await this.doctorModel.findOne(withBranch({ _id: doctorId }, branchId));
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

    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:doctor_assigned', {
      visit: savedVisit,
      doctorId,
      assignedBy: nurseId,
    });

    return savedVisit;
  }

  async getAwaitingTriage(branchId?: string): Promise<Visit[]> {
    const query: any = withBranch({ status: VisitStatusEnum.AWAITING_TRIAGE }, branchId);
    return this.visitModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions insurance')
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
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) throw new NotFoundException('Visit not found');

    visit.referredToSpecialistId = new Types.ObjectId(data.specialistId);
    visit.referralReason = data.reason;
    visit.referralNotes = data.notes;
    visit.referredAt = new Date();
    visit.status = VisitStatusEnum.REFERRED;

    const savedVisit = await visit.save();
    this.logger.log(`Visit ${savedVisit.visitNumber} referred to specialist ${data.specialistId}`);

    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:referred', savedVisit);
    return savedVisit;
  }

  async getSpecialistReferrals(specialistId: string, branchId?: string): Promise<Visit[]> {
    return this.visitModel
      .find({
        referredToSpecialistId: new Types.ObjectId(specialistId),
        status: VisitStatusEnum.REFERRED,
        ...(branchId ? { branchId } : {}),
      })
      .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions insurance')
      .populate('doctorId', 'fullName department')
      .sort({ referredAt: -1 })
      .exec();
  }

  async acceptReferral(id: string, specialistId: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.status !== VisitStatusEnum.REFERRED) {
      throw new BadRequestException('Visit is not a referral');
    }

    const specialist = await this.doctorModel.findOne(withBranch({ _id: new Types.ObjectId(specialistId) }, branchId));
    if (!specialist) throw new NotFoundException('Specialist not found in this branch');

    visit.doctorId = new Types.ObjectId(specialistId);
    visit.status = VisitStatusEnum.IN_CONSULTATION;
    visit.consultationStartedAt = new Date();

    const savedVisit = await visit.save();
    this.logger.log(`Specialist accepted referral: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:accepted', savedVisit);
    return savedVisit;
  }

  async acceptPatient(id: string, doctorId: string, branchId?: string): Promise<Visit> {
    const requiredBranchId = requireBranchId(branchId);
    const visit = await this.visitModel.findOne(withBranch({ _id: new Types.ObjectId(id) }, requiredBranchId));
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.IN_QUEUE) {
      throw new BadRequestException('Visit is not in queue');
    }

    if (!visit.room) {
      const room: any = await this.visitModel.db.model('Room').findOneAndUpdate(
        withBranch({ roomType: 'consultation', status: 'available' }, requiredBranchId),
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
      withBranch({ visitId: new Types.ObjectId(id) }, requiredBranchId),
      {
        status: QueueStatusEnum.WITH_DOCTOR,
        doctorId: new Types.ObjectId(doctorId),
        doctorCalledAt: new Date(),
      },
    );

    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:accepted', savedVisit);

    return savedVisit;
  }

  async orderLab(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.IN_CONSULTATION) {
      throw new BadRequestException('Visit is not in consultation');
    }

    visit.status = VisitStatusEnum.AWAITING_LAB;
    const savedVisit = await visit.save();

    this.logger.log(`Lab ordered for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:lab_ordered', savedVisit);

    return savedVisit;
  }

  async prescribeMedication(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.IN_CONSULTATION) {
      throw new BadRequestException('Visit is not in consultation');
    }

    visit.status = VisitStatusEnum.AWAITING_PHARMACY;
    const savedVisit = await visit.save();

    this.logger.log(`Medication prescribed for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:pharmacy_ordered', savedVisit);

    return savedVisit;
  }

  async markLabPaid(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_LAB) {
      throw new BadRequestException('Visit is not awaiting lab payment');
    }

    visit.status = VisitStatusEnum.AWAITING_RESULTS;
    const savedVisit = await visit.save();

    this.logger.log(`Lab paid for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:lab_paid', savedVisit);

    return savedVisit;
  }

  async markPharmacyPaid(id: string, paymentMethod = 'cash', receivedBy?: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
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
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:pharmacy_paid', savedVisit);

    return savedVisit;
  }

  async markDispensed(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_DISPENSING) {
      throw new BadRequestException('Visit is not awaiting dispensing');
    }

    visit.status = VisitStatusEnum.AWAITING_DOCTOR_REVIEW;
    const savedVisit = await visit.save();

    this.logger.log(`Drugs dispensed, awaiting doctor review: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:dispensed', savedVisit);

    return savedVisit;
  }

  async resultsReleased(id: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.status !== VisitStatusEnum.AWAITING_RESULTS) {
      throw new BadRequestException('Visit is not awaiting results');
    }

    visit.status = VisitStatusEnum.RESULTS_READY;
    const savedVisit = await visit.save();

    this.logger.log(`Results released for visit: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:results_ready', savedVisit);

    return savedVisit;
  }

  async complete(
    id: string,
    dto: CompleteVisitDto,
    actor: ClinicalVisitActor,
    branchId?: string,
  ): Promise<Visit> {
    const requiredBranchId = requireBranchId(branchId);
    const session = await this.visitModel.db.startSession();
    let savedVisit: Visit | undefined;
    try {
      await session.withTransaction(async () => {
        const visit = await this.visitModel
          .findOne(withBranch({ _id: new Types.ObjectId(id) }, requiredBranchId))
          .session(session);
        if (!visit) throw new NotFoundException('Visit not found');
        await this.assertClinicalVisitAccess(visit, actor);
        if (![VisitStatusEnum.IN_CONSULTATION, VisitStatusEnum.RESULTS_READY, VisitStatusEnum.AWAITING_DOCTOR_REVIEW].includes(visit.status)) {
          throw new BadRequestException(`Visit cannot be completed from status '${visit.status}'`);
        }

        const linkedOrders = await this.visitModel.db
          .model('Order')
          .find(withBranch({
            visitId: visit._id,
            orderType: { $in: [OrderTypeEnum.LAB, OrderTypeEnum.PHARMACY] },
            status: { $ne: OrderStatusEnum.CANCELLED },
          }, requiredBranchId))
          .session(session)
          .lean();
        if (linkedOrders.some((order: any) => order.paymentStatus !== PaymentStatusEnum.PAID)) {
          throw new BadRequestException('Visit has unpaid clinical orders');
        }
        if (linkedOrders.some((order: any) => order.orderType === OrderTypeEnum.LAB && order.status !== OrderStatusEnum.COMPLETED)) {
          throw new BadRequestException('Visit has lab orders pending result release');
        }
        if (linkedOrders.some((order: any) => order.orderType === OrderTypeEnum.PHARMACY && order.status !== OrderStatusEnum.COMPLETED)) {
          throw new BadRequestException('Visit has pharmacy orders pending dispensing');
        }

        this.applyClinicalVisitFields(visit, dto);
        await this.persistCanonicalSoap(visit, dto, requiredBranchId, actor, session, true);
        if (visit.room) {
          await this.visitModel.db.model('Room').findOneAndUpdate(
            withBranch({ name: visit.room }, requiredBranchId),
            { status: 'available', currentVisitId: null, currentPatientName: null },
            { session },
          );
        }
        visit.status = VisitStatusEnum.COMPLETED;
        visit.dischargedAt = new Date();
        savedVisit = await visit.save({ session });
      });
    } finally {
      await session.endSession();
    }
    if (!savedVisit) throw new ConflictException('Visit completion transaction did not commit');
    this.logger.log(`Visit completed: ${savedVisit.visitNumber}`);
    this.realtimeGateway.emitToBranch(savedVisit.branchId?.toString(), 'visit:completed', savedVisit);
    return savedVisit;
  }

  async cancel(id: string, reason: string, cancelledBy: string, branchId?: string): Promise<Visit> {
    const visit = await this.visitModel.findOne({ _id: new Types.ObjectId(id), ...branchFilterOptional(branchId) });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }

    if (visit.room) {
      const RoomModel = this.visitModel.db.model('Room');
      await RoomModel.findOneAndUpdate(
        withBranch({ name: visit.room }, branchId),
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
    const branchFilter = withBranch({}, branchId);
    const systemDoctor = await this.isSystemDoctor(doctorId);

    const matchStage: any = { ...(systemDoctor ? {} : { doctorId: doctorObjectId }), ...branchFilter };
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
        insurance: '$patient.insurance',
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
