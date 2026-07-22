import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Admission,
  AdmissionStatusEnum,
  FluidDirectionEnum,
} from '../database/schemas/admission.schema';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { SoapNote, SoapNoteTypeEnum } from '../database/schemas/soap-note.schema';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { withBranch } from '../common/utils/branch-scope';
import { ServicePriceCodeEnum } from '../database/schemas/service-price.schema';
import { ServicePricesService } from '../service-prices/service-prices.service';

@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    @InjectModel(Admission.name) private admissionModel: Model<Admission>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    @InjectModel(SoapNote.name) private soapNoteModel: Model<SoapNote>,
    private realtimeGateway: RealtimeGateway,
    private servicePricesService: ServicePricesService,
  ) {}

  private async generateAdmissionNumber(branchId?: string): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const branchPart = branchId ? branchId.toString() : 'global';
    const sequenceId = `admission_number_${branchPart}_${datePart}`;
    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      { $inc: { currentValue: 1 }, $setOnInsert: { prefix: 'ADM', datePart } },
      { upsert: true, new: true },
    );
    return `ADM-${datePart}-${sequence.currentValue.toString().padStart(4, '0')}`;
  }

  async create(dto: CreateAdmissionDto, admittedBy?: string, branchId?: string): Promise<Admission> {
    const existingAdmission = await this.admissionModel.findOne({
      patientId: new Types.ObjectId(dto.patientId),
      status: AdmissionStatusEnum.ADMITTED,
    });
    if (existingAdmission) {
      throw new BadRequestException('Patient already has an active admission');
    }

    const admissionNumber = await this.generateAdmissionNumber(branchId);

    const admission = new this.admissionModel({
      ...dto,
      admissionNumber,
      patientId: new Types.ObjectId(dto.patientId),
      visitId: dto.visitId ? new Types.ObjectId(dto.visitId) : undefined,
      doctorId: dto.doctorId ? new Types.ObjectId(dto.doctorId) : undefined,
      primaryNurseId: dto.primaryNurseId ? new Types.ObjectId(dto.primaryNurseId) : undefined,
      admittedBy: admittedBy ? new Types.ObjectId(admittedBy) : undefined,
      branchId: branchId ? new Types.ObjectId(branchId) : undefined,
    });

    const saved = await admission.save();

    // Mark associated visit as admitted
    if (dto.visitId) {
      await this.visitModel.updateOne(
        { _id: new Types.ObjectId(dto.visitId) },
        { status: VisitStatusEnum.ADMITTED },
      );
    }

    this.logger.log(`Admission created: ${saved.admissionNumber}`);
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:created', saved);
    return saved;
  }

  async findAll(status?: AdmissionStatusEnum, wardType?: string, nurseId?: string, branchId?: string) {
    const query: any = withBranch({}, branchId);
    if (status) query.status = status;
    if (wardType) query.wardType = wardType;
    if (nurseId) query.primaryNurseId = new Types.ObjectId(nurseId);

    return this.admissionModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName age gender phone allergies chronicConditions dateOfBirth')
      .populate('doctorId', 'fullName department')
      .populate('primaryNurseId', 'fullName')
      .sort({ admittedAt: -1 })
      .exec();
  }

  async findActive(branchId?: string) {
    return this.findAll(AdmissionStatusEnum.ADMITTED, undefined, undefined, branchId);
  }

  async findByPatient(patientId: string, branchId?: string) {
    return this.admissionModel
      .find(withBranch({ patientId: new Types.ObjectId(patientId) }, branchId))
      .populate('doctorId', 'fullName department')
      .sort({ admittedAt: -1 })
      .exec();
  }

  async findOne(id: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel
      .findOne(withBranch({ _id: id }, branchId))
      .populate('patientId')
      .populate('doctorId')
      .populate('primaryNurseId', 'fullName')
      .populate('vitalsLog.recordedBy', 'fullName')
      .populate('medicationLog.administeredBy', 'fullName')
      .populate('fluidBalance.recordedBy', 'fullName')
      .populate('nursingNotes.authoredBy', 'fullName')
      .populate('carePlan.createdBy', 'fullName')
      .populate('incidents.reportedBy', 'fullName')
      .populate('shiftHandovers.handedOverBy', 'fullName')
      .exec();
    if (!admission) throw new NotFoundException('Admission not found');

    // Fetch all clinical notes for this patient.
    // We include notes from the linked visit (if any) AND any notes written
    // directly against the patient — so the nurse sees the full clinical picture
    // regardless of whether the doctor linked the note to the visit or not.
    const noteQuery: any = { patientId: admission.patientId };
    if (admission.visitId) {
      // Prefer notes from this specific visit, but also include notes with no visitId
      // (e.g. ward round notes written directly against the patient)
      noteQuery.$or = [
        { visitId: admission.visitId },
        { visitId: { $exists: false } },
        { visitId: null },
      ];
    }

    const clinicalNotes = await this.soapNoteModel
      .find(noteQuery)
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();

    return {
      ...admission.toObject(),
      clinicalNotes,
    } as any;
  }

  async update(id: string, data: any, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOneAndUpdate(withBranch({ _id: id }, branchId), data, { new: true });
    if (!admission) throw new NotFoundException('Admission not found');
    this.realtimeGateway.emitToBranch(admission.branchId?.toString(), 'admission:updated', admission);
    return admission;
  }

  private ensureActive(admission: Admission) {
    if (admission.status !== AdmissionStatusEnum.ADMITTED) {
      throw new BadRequestException('Cannot modify non-active admission');
    }
  }

  // ---------- Vitals ----------
  async recordVitals(id: string, vitals: any, recordedBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    admission.vitalsLog.push({
      ...vitals,
      recordedBy: recordedBy ? new Types.ObjectId(recordedBy) : undefined,
      recordedAt: new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:vitals_recorded', saved);
    return saved;
  }

  // ---------- Medications ----------
  async recordMedication(id: string, med: any, administeredBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    admission.medicationLog.push({
      ...med,
      medicationId: med.medicationId ? new Types.ObjectId(med.medicationId) : undefined,
      prescriptionId: med.prescriptionId ? new Types.ObjectId(med.prescriptionId) : undefined,
      administeredBy: administeredBy ? new Types.ObjectId(administeredBy) : undefined,
      administeredAt: new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:medication_administered', saved);
    return saved;
  }

  // ---------- Fluid balance ----------
  async recordFluid(
    id: string,
    entry: { direction: FluidDirectionEnum; fluidType: string; volumeMl: number; route?: string; notes?: string },
    recordedBy?: string,
    branchId?: string,
  ): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    if (entry.volumeMl <= 0) throw new BadRequestException('Volume must be positive');

    admission.fluidBalance.push({
      ...entry,
      recordedBy: recordedBy ? new Types.ObjectId(recordedBy) : undefined,
      recordedAt: new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:fluid_recorded', saved);
    return saved;
  }

  async getFluidBalance(id: string, startDate?: string, endDate?: string, branchId?: string) {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId)).select('fluidBalance admissionNumber');
    if (!admission) throw new NotFoundException('Admission not found');

    let entries = admission.fluidBalance;
    if (startDate || endDate) {
      entries = entries.filter((e) => {
        if (startDate && e.recordedAt < new Date(startDate)) return false;
        if (endDate && e.recordedAt > new Date(endDate)) return false;
        return true;
      });
    }

    const intake = entries
      .filter((e) => e.direction === FluidDirectionEnum.INTAKE)
      .reduce((sum, e) => sum + e.volumeMl, 0);
    const output = entries
      .filter((e) => e.direction === FluidDirectionEnum.OUTPUT)
      .reduce((sum, e) => sum + e.volumeMl, 0);

    return {
      admissionNumber: admission.admissionNumber,
      totalIntakeMl: intake,
      totalOutputMl: output,
      netMl: intake - output,
      entries,
    };
  }

  // ---------- Nursing notes (SOAP) ----------
  async addNursingNote(id: string, note: any, authoredBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    admission.nursingNotes.push({
      ...note,
      authoredBy: authoredBy ? new Types.ObjectId(authoredBy) : undefined,
      authoredAt: new Date(),
    } as any);

    const saved = await admission.save();
    await this.soapNoteModel.create({
      patientId: saved.patientId,
      visitId: saved.visitId,
      nurseId: authoredBy ? new Types.ObjectId(authoredBy) : undefined,
      noteType: SoapNoteTypeEnum.NURSE_NOTE,
      chiefComplaint: note.subjective || note.narrative,
      historyPresentIllness: note.subjective,
      physicalExamination: note.objective,
      diagnosis: note.assessment,
      treatmentPlan: note.plan,
    });
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:note_added', saved);
    return saved;
  }

  // ---------- Shift handover ----------
  async addShiftHandover(id: string, handover: any, handedOverBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    admission.shiftHandovers.push({
      ...handover,
      handedOverBy: handedOverBy ? new Types.ObjectId(handedOverBy) : undefined,
      handedOverAt: new Date(),
    } as any);

    admission.nursingNotes.push({
      narrative: `SHIFT HANDOVER (${handover.shift}): ${handover.conditionSummary || ''} ${handover.tasksForNextShift ? `Tasks: ${handover.tasksForNextShift}` : ''}`.trim(),
      authoredBy: handedOverBy ? new Types.ObjectId(handedOverBy) : undefined,
      authoredAt: new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:handover_added', saved);
    return saved;
  }

  // ---------- Care plan ----------
  async addCarePlanItem(id: string, item: any, createdBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    admission.carePlan.push({
      ...item,
      status: item.status || 'active',
      createdBy: createdBy ? new Types.ObjectId(createdBy) : undefined,
      createdAt: new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:care_plan_updated', saved);
    return saved;
  }

  async resolveCarePlanItem(id: string, itemIndex: number, evaluation?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    if (!admission.carePlan[itemIndex]) throw new NotFoundException('Care plan item not found');

    admission.carePlan[itemIndex].status = 'resolved';
    admission.carePlan[itemIndex].resolvedAt = new Date();
    if (evaluation) admission.carePlan[itemIndex].evaluation = evaluation;

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:care_plan_updated', saved);
    return saved;
  }

  // ---------- Incidents ----------
  async reportIncident(id: string, incident: any, reportedBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');

    admission.incidents.push({
      ...incident,
      reportedBy: reportedBy ? new Types.ObjectId(reportedBy) : undefined,
      occurredAt: incident.occurredAt ? new Date(incident.occurredAt) : new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:incident_reported', saved);
    return saved;
  }

  // ---------- Oxygen therapy ----------
  async startOxygenTherapy(id: string, data: {
    litersPerMinute: number;
    hoursPerDay: number;
    days: number;
    ratePerHour?: number;
    notes?: string;
  }, startedBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    if (data.litersPerMinute <= 0) throw new BadRequestException('Flow rate must be positive');
    if (data.hoursPerDay <= 0 || data.hoursPerDay > 24) throw new BadRequestException('Hours per day must be between 1 and 24');
    if (data.days <= 0) throw new BadRequestException('Days must be positive');
    if (data.ratePerHour !== undefined && data.ratePerHour < 0) throw new BadRequestException('Rate per hour cannot be negative');

    const configuredRate = await this.servicePricesService.getPrice(admission.branchId?.toString(), ServicePriceCodeEnum.OXYGEN_HOUR);
    const rate = data.ratePerHour ?? configuredRate;
    const totalHours = data.hoursPerDay * data.days;
    const totalCost = totalHours * rate;

    if (!Array.isArray(admission.oxygenTherapy)) admission.oxygenTherapy = [];
    admission.oxygenTherapy.push({
      litersPerMinute: data.litersPerMinute,
      hoursPerDay: data.hoursPerDay,
      days: data.days,
      ratePerHour: rate,
      totalCost,
      notes: data.notes,
      status: 'active',
      startedBy: startedBy ? new Types.ObjectId(startedBy) : undefined,
      startedAt: new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:oxygen_started', saved);
    return saved;
  }

  async stopOxygenTherapy(id: string, therapyIndex: number, stoppedBy?: string, branchId?: string): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    if (!Number.isInteger(therapyIndex) || therapyIndex < 0) throw new BadRequestException('Invalid oxygen therapy index');
    if (!admission.oxygenTherapy?.[therapyIndex]) throw new NotFoundException('Oxygen therapy entry not found');

    admission.oxygenTherapy[therapyIndex].status = 'stopped';
    admission.oxygenTherapy[therapyIndex].stoppedAt = new Date();
    admission.oxygenTherapy[therapyIndex].stoppedBy = stoppedBy ? new Types.ObjectId(stoppedBy) : undefined;

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:oxygen_stopped', saved);
    return saved;
  }

  getOxygenCostSummary(admission: Admission) {
    const activeTherapies = (admission.oxygenTherapy || []).filter(t => t.status === 'active');
    const completedTherapies = (admission.oxygenTherapy || []).filter(t => t.status !== 'active');
    const activeCost = activeTherapies.reduce((sum, t) => sum + (t.totalCost || 0), 0);
    const completedCost = completedTherapies.reduce((sum, t) => sum + (t.totalCost || 0), 0);
    return {
      activeCount: activeTherapies.length,
      activeCost,
      completedCost,
      totalCost: activeCost + completedCost,
      therapies: admission.oxygenTherapy || [],
    };
  }

  // ---------- Transfer / Discharge ----------
  async transfer(
    id: string,
    data: { wardType?: string; bedNumber?: string; notes?: string },
    transferredBy?: string,
    branchId?: string,
  ): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    this.ensureActive(admission);

    if (data.wardType) admission.wardType = data.wardType as any;
    if (data.bedNumber) admission.bedNumber = data.bedNumber;

    // Record as a nursing note for traceability
    admission.nursingNotes.push({
      narrative: `TRANSFER: moved to ${data.wardType || 'same ward'} / bed ${data.bedNumber || 'N/A'}. ${data.notes || ''}`.trim(),
      authoredBy: transferredBy ? new Types.ObjectId(transferredBy) : undefined,
      authoredAt: new Date(),
    } as any);

    const saved = await admission.save();
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:transferred', saved);
    return saved;
  }

  async discharge(
    id: string,
    data: { dischargeNotes?: string; dischargeDiagnosis?: string; dischargeInstructions?: string },
    dischargedBy?: string,
    branchId?: string,
  ): Promise<Admission> {
    const admission = await this.admissionModel.findOne(withBranch({ _id: id }, branchId));
    if (!admission) throw new NotFoundException('Admission not found');
    if (admission.status !== AdmissionStatusEnum.ADMITTED) {
      throw new BadRequestException('Admission is not active');
    }

    admission.status = AdmissionStatusEnum.DISCHARGED;
    admission.dischargedAt = new Date();
    admission.dischargeNotes = data.dischargeNotes;
    admission.dischargeDiagnosis = data.dischargeDiagnosis;
    admission.dischargeInstructions = data.dischargeInstructions;
    admission.dischargedBy = dischargedBy ? new Types.ObjectId(dischargedBy) : undefined;

    const saved = await admission.save();

    // Close the visit
    if (admission.visitId) {
      await this.visitModel.updateOne(
        { _id: admission.visitId },
        { status: VisitStatusEnum.COMPLETED, dischargedAt: new Date() },
      );
    }

    this.logger.log(`Admission discharged: ${saved.admissionNumber}`);
    this.realtimeGateway.emitToBranch(saved.branchId?.toString(), 'admission:discharged', saved);
    return saved;
  }

  // ---------- Stats / Dashboard ----------
  async getStats(branchId?: string) {
    const scope = withBranch({}, branchId);
    const [activeTotal, byWard, todayAdmissions, todayDischarges, dueMedsCount] = await Promise.all([
      this.admissionModel.countDocuments({ ...scope, status: AdmissionStatusEnum.ADMITTED }),
      this.admissionModel.aggregate([
        { $match: { ...scope, status: AdmissionStatusEnum.ADMITTED } },
        { $group: { _id: '$wardType', count: { $sum: 1 } } },
      ]),
      this.admissionModel.countDocuments({
        ...scope, admittedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      this.admissionModel.countDocuments({
        ...scope, dischargedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      this.admissionModel.countDocuments({
        ...scope, status: AdmissionStatusEnum.ADMITTED,
        'medicationLog.0': { $exists: true },
      }),
    ]);

    return {
      activeTotal,
      byWard,
      todayAdmissions,
      todayDischarges,
      dueMedsCount,
    };
  }

  async getNurseDashboard(nurseId?: string, branchId?: string) {
    const [activeAdmissions, stats] = await Promise.all([
      this.findAll(AdmissionStatusEnum.ADMITTED, undefined, nurseId, branchId),
      this.getStats(branchId),
    ]);

    return {
      activeAdmissions,
      stats,
    };
  }
}
