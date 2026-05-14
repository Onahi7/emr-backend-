import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Consultation, ConsultationStatusEnum, ConsultationTypeEnum } from '../database/schemas/consultation.schema';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { Patient } from '../database/schemas/patient.schema';
import { Doctor } from '../database/schemas/doctor.schema';

@Injectable()
export class ConsultationsService {
  constructor(
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
  ) {}

  async create(createConsultationDto: CreateConsultationDto): Promise<Consultation> {
    const { patientId, doctorId, consultationType, consultationFee, chiefComplaint, nurseId } = createConsultationDto;

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Verify doctor exists
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('Invalid doctor ID');
    }
    const doctor = await this.doctorModel.findById(doctorId);
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    // Generate consultation number
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const count = await this.consultationModel.countDocuments({
      createdAt: {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    });
    const consultationNumber = `CONS-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    const consultation = new this.consultationModel({
      consultationNumber,
      patientId: new Types.ObjectId(patientId),
      doctorId: new Types.ObjectId(doctorId),
      consultationType,
      consultationFee,
      chiefComplaint,
      status: ConsultationStatusEnum.SCHEDULED,
      isPaid: false,
      nurseId: nurseId ? new Types.ObjectId(nurseId) : undefined,
    });

    return consultation.save();
  }

  async findAll(query: any = {}): Promise<Consultation[]> {
    return this.consultationModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName')
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<Consultation> {
    const consultation = await this.consultationModel
      .findById(id)
      .populate('patientId')
      .populate('doctorId')
      .populate('nurseId')
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    return consultation;
  }

  async findByPatient(patientId: string): Promise<Consultation[]> {
    return this.consultationModel
      .find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(id: string, updateConsultationDto: UpdateConsultationDto): Promise<Consultation> {
    const consultation = await this.consultationModel.findById(id);
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

  async markAsPaid(id: string): Promise<Consultation> {
    const consultation = await this.consultationModel.findById(id);
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    consultation.isPaid = true;
    return consultation.save();
  }

  async cancel(id: string, reason: string, cancelledBy: string): Promise<Consultation> {
    const consultation = await this.consultationModel.findById(id);
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
