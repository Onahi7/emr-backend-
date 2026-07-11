import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Consultation, ConsultationStatusEnum, ConsultationTypeEnum } from '../database/schemas/consultation.schema';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { Patient } from '../database/schemas/patient.schema';
import { Doctor } from '../database/schemas/doctor.schema';
import { withBranch } from '../common/utils/branch-scope';

@Injectable()
export class ConsultationsService {
  constructor(
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
  ) {}

  async create(createConsultationDto: CreateConsultationDto, branchId?: string): Promise<Consultation> {
    const { patientId, doctorId, consultationType, consultationFee, chiefComplaint, nurseId } = createConsultationDto;

    const patient = await this.patientModel.findOne(withBranch({ _id: new Types.ObjectId(patientId) }, branchId));
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findOne(withBranch({ _id: new Types.ObjectId(doctorId) }, branchId));
    if (!doctor) {
      throw new NotFoundException('Doctor not found in this branch');
    }

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const countQuery: any = {
      createdAt: {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    };
    if (branchId) countQuery.branchId = branchId;
    const count = await this.consultationModel.countDocuments(countQuery);
    const consultationNumber = `CONS-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    const consultationData: any = {
      consultationNumber,
      patientId: new Types.ObjectId(patientId),
      doctorId: new Types.ObjectId(doctorId),
      consultationType,
      consultationFee,
      chiefComplaint,
      status: ConsultationStatusEnum.SCHEDULED,
      isPaid: false,
      nurseId: nurseId ? new Types.ObjectId(nurseId) : undefined,
    };
    if (branchId) consultationData.branchId = branchId;

    const consultation = new this.consultationModel(consultationData);

    return consultation.save();
  }

  async findAll(query: any = {}, branchId?: string): Promise<Consultation[]> {
    const filter = branchId ? { ...query, branchId } : query;
    return this.consultationModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName')
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string, branchId?: string): Promise<Consultation> {
    const consultation = await this.consultationModel
      .findOne({ _id: new Types.ObjectId(id), ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}) })
      .populate('patientId')
      .populate('doctorId')
      .populate('nurseId')
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    return consultation;
  }

  async findByPatient(patientId: string, branchId?: string): Promise<Consultation[]> {
    return this.consultationModel
      .find({ patientId: new Types.ObjectId(patientId), ...(branchId ? { branchId } : {}) })
      .populate('doctorId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(id: string, updateConsultationDto: UpdateConsultationDto, branchId?: string): Promise<Consultation> {
    const consultation = await this.consultationModel.findOne({ _id: new Types.ObjectId(id), ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}) });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    if (updateConsultationDto.status === ConsultationStatusEnum.IN_PROGRESS && !consultation.startedAt) {
      updateConsultationDto['startedAt'] = new Date();
    }

    if (updateConsultationDto.status === ConsultationStatusEnum.COMPLETED && !consultation.completedAt) {
      updateConsultationDto['completedAt'] = new Date();
    }

    Object.assign(consultation, updateConsultationDto);
    return consultation.save();
  }

  async markAsPaid(id: string, branchId?: string): Promise<Consultation> {
    const consultation = await this.consultationModel.findOne({ _id: new Types.ObjectId(id), ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}) });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    consultation.isPaid = true;
    return consultation.save();
  }

  async cancel(id: string, reason: string, cancelledBy: string, branchId?: string): Promise<Consultation> {
    const consultation = await this.consultationModel.findOne({ _id: new Types.ObjectId(id), ...(branchId ? { branchId: new Types.ObjectId(branchId) } : {}) });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    consultation.status = ConsultationStatusEnum.CANCELLED;
    consultation.cancelledAt = new Date();
    consultation.cancelledBy = new Types.ObjectId(cancelledBy);
    consultation.cancellationReason = reason;
    return consultation.save();
  }
}
