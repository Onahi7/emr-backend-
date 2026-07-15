import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { requireBranchId, withBranch } from '../common/utils/branch-scope';
import { Patient } from '../database/schemas/patient.schema';
import { SoapNote, SoapNoteTypeEnum } from '../database/schemas/soap-note.schema';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { Visit } from '../database/schemas/visit.schema';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';

export interface ClinicalActor {
  userId: string;
  doctorId?: string;
  roles?: string[];
}

@Injectable()
export class SoapNotesService {
  constructor(
    @InjectModel(SoapNote.name) private soapNoteModel: Model<SoapNote>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
  ) {}

  private isAdmin(actor: ClinicalActor): boolean {
    return actor.roles?.includes(UserRoleEnum.ADMIN) === true;
  }

  private async findVisitScoped(visitId: string, branchId: string): Promise<Visit> {
    const visit = await this.visitModel.findOne(withBranch({ _id: new Types.ObjectId(visitId) }, branchId));
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }

  private assertVisitAccess(visit: Visit, actor: ClinicalActor, allowNurse = false): void {
    if (this.isAdmin(actor)) return;
    if (allowNurse && actor.roles?.includes(UserRoleEnum.NURSE)) return;
    if (!actor.doctorId || !visit.doctorId || visit.doctorId.toString() !== actor.doctorId) {
      throw new ForbiddenException('This clinical note belongs to another treating doctor');
    }
  }

  private async findScopedById(id: string, branchId?: string): Promise<SoapNote> {
    const requiredBranchId = requireBranchId(branchId);
    const note = await this.soapNoteModel.findById(id);
    if (!note) throw new NotFoundException('SOAP note not found');

    if (note.branchId) {
      if (note.branchId.toString() !== requiredBranchId) throw new NotFoundException('SOAP note not found');
      return note;
    }

    if (note.visitId) {
      await this.findVisitScoped(note.visitId.toString(), requiredBranchId);
    } else {
      const patient = await this.patientModel.findOne(withBranch({ _id: note.patientId }, requiredBranchId));
      if (!patient) throw new NotFoundException('SOAP note not found');
    }
    note.branchId = new Types.ObjectId(requiredBranchId);
    return note;
  }

  async create(createSoapNoteDto: CreateSoapNoteDto, branchId?: string, actor?: ClinicalActor): Promise<SoapNote> {
    const requiredBranchId = requireBranchId(branchId);
    if (!actor?.userId) throw new ForbiddenException('Authenticated clinical actor required');
    const patient = await this.patientModel.findOne(
      withBranch({ _id: new Types.ObjectId(createSoapNoteDto.patientId) }, requiredBranchId),
    );
    if (!patient) throw new NotFoundException('Patient not found');

    let visit: Visit | undefined;
    if (createSoapNoteDto.visitId) {
      visit = await this.findVisitScoped(createSoapNoteDto.visitId, requiredBranchId);
      if (visit.patientId.toString() !== createSoapNoteDto.patientId) {
        throw new ForbiddenException('Patient does not belong to this visit');
      }
      this.assertVisitAccess(visit, actor, createSoapNoteDto.noteType === SoapNoteTypeEnum.NURSE_NOTE);
      const existing = await this.soapNoteModel
        .findOne(withBranch({ visitId: visit._id, addendumTo: { $exists: false } }, requiredBranchId))
        .sort({ updatedAt: -1 });
      if (existing) throw new ConflictException('A SOAP note already exists for this visit; update the draft instead');
    }

    let consultationId: Types.ObjectId | undefined;
    if (createSoapNoteDto.consultationId) {
      const consultation: any = await this.patientModel.db.model('Consultation').findOne(
        withBranch({ _id: new Types.ObjectId(createSoapNoteDto.consultationId) }, requiredBranchId),
      );
      if (!consultation || consultation.patientId?.toString() !== createSoapNoteDto.patientId) {
        throw new ForbiddenException('Consultation does not belong to this patient and branch');
      }
      if (!this.isAdmin(actor) && consultation.doctorId?.toString() !== actor.userId) {
        throw new ForbiddenException('This consultation belongs to another treating doctor');
      }
      consultationId = consultation._id;
    }
    if (!visit && !consultationId && createSoapNoteDto.noteType !== SoapNoteTypeEnum.NURSE_NOTE) {
      throw new ForbiddenException('An active visit or consultation is required for a clinical SOAP note');
    }

    const soapNote = new this.soapNoteModel({
      ...createSoapNoteDto,
      branchId: new Types.ObjectId(requiredBranchId),
      patientId: patient._id,
      visitId: visit?._id,
      consultationId,
      doctorId: actor.doctorId ? new Types.ObjectId(actor.doctorId) : visit?.doctorId,
      nurseId: actor.roles?.includes(UserRoleEnum.NURSE)
        ? new Types.ObjectId(actor.userId)
        : createSoapNoteDto.nurseId ? new Types.ObjectId(createSoapNoteDto.nurseId) : undefined,
      noteType: createSoapNoteDto.noteType || SoapNoteTypeEnum.CONSULTATION,
      createdBy: new Types.ObjectId(actor.userId),
      updatedBy: new Types.ObjectId(actor.userId),
      isSigned: false,
    });
    return soapNote.save();
  }

  async findAll(branchId?: string): Promise<SoapNote[]> {
    return this.soapNoteModel
      .find(withBranch({}, requireBranchId(branchId)))
      .populate('patientId', 'firstName lastName patientId')
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .populate('consultationId', 'consultationNumber')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string, branchId?: string): Promise<SoapNote> {
    const note = await this.findScopedById(id, branchId);
    return note.populate(['patientId', 'doctorId', 'nurseId', 'consultationId']);
  }

  async findByPatient(patientId: string, branchId?: string): Promise<SoapNote[]> {
    const requiredBranchId = requireBranchId(branchId);
    const patient = await this.patientModel.findOne(withBranch({ _id: new Types.ObjectId(patientId) }, requiredBranchId));
    if (!patient) throw new NotFoundException('Patient not found');
    return this.soapNoteModel
      .find({ patientId: patient._id, $or: [{ branchId: new Types.ObjectId(requiredBranchId) }, { branchId: { $exists: false } }] })
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .populate('consultationId', 'consultationNumber')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByConsultation(consultationId: string, branchId?: string): Promise<SoapNote[]> {
    const notes = await this.soapNoteModel.find({ consultationId: new Types.ObjectId(consultationId) }).sort({ createdAt: -1 });
    const scoped: SoapNote[] = [];
    for (const note of notes) {
      try {
        scoped.push(await this.findScopedById(note._id.toString(), branchId));
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return scoped;
  }

  async findByVisit(visitId: string, branchId?: string): Promise<SoapNote[]> {
    const requiredBranchId = requireBranchId(branchId);
    const visit = await this.findVisitScoped(visitId, requiredBranchId);
    return this.soapNoteModel
      .find({ visitId: visit._id, $or: [{ branchId: new Types.ObjectId(requiredBranchId) }, { branchId: { $exists: false } }] })
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(id: string, dto: UpdateSoapNoteDto, branchId?: string, actor?: ClinicalActor): Promise<SoapNote> {
    if (!actor?.userId) throw new ForbiddenException('Authenticated clinical actor required');
    const note = await this.findScopedById(id, branchId);
    if (note.isSigned) throw new ConflictException('Signed SOAP notes are immutable; create an addendum instead');
    if (note.visitId) this.assertVisitAccess(
      await this.findVisitScoped(note.visitId.toString(), requireBranchId(branchId)),
      actor,
      note.noteType === SoapNoteTypeEnum.NURSE_NOTE,
    );
    Object.assign(note, dto, { updatedBy: new Types.ObjectId(actor.userId) });
    return note.save();
  }

  async sign(id: string, branchId?: string, actor?: ClinicalActor): Promise<SoapNote> {
    if (!actor?.userId) throw new ForbiddenException('Authenticated clinical actor required');
    const note = await this.findScopedById(id, branchId);
    if (note.isSigned) {
      if (note.signedBy?.toString() === actor.userId) return note;
      throw new ConflictException('SOAP note is already signed');
    }
    if (note.visitId) this.assertVisitAccess(await this.findVisitScoped(note.visitId.toString(), requireBranchId(branchId)), actor);
    note.isSigned = true;
    note.signedAt = new Date();
    note.signedBy = new Types.ObjectId(actor.userId);
    note.updatedBy = new Types.ObjectId(actor.userId);
    return note.save();
  }

  async createAddendum(id: string, text: string, branchId?: string, actor?: ClinicalActor): Promise<SoapNote> {
    if (!actor?.userId) throw new ForbiddenException('Authenticated clinical actor required');
    const original = await this.findScopedById(id, branchId);
    if (!original.isSigned) throw new ConflictException('Addenda can only be attached to a signed SOAP note');
    if (original.visitId) {
      this.assertVisitAccess(await this.findVisitScoped(original.visitId.toString(), requireBranchId(branchId)), actor);
    }
    const trimmed = text.trim();
    if (!trimmed) throw new ConflictException('Addendum text is required');
    const addendum = new this.soapNoteModel({
      branchId: original.branchId || new Types.ObjectId(requireBranchId(branchId)),
      patientId: original.patientId,
      visitId: original.visitId,
      consultationId: original.consultationId,
      doctorId: actor.doctorId ? new Types.ObjectId(actor.doctorId) : original.doctorId,
      noteType: original.noteType,
      addendumTo: original._id,
      addendumText: trimmed,
      createdBy: new Types.ObjectId(actor.userId),
      updatedBy: new Types.ObjectId(actor.userId),
      isSigned: true,
      signedAt: new Date(),
      signedBy: new Types.ObjectId(actor.userId),
    });
    return addendum.save();
  }
}
