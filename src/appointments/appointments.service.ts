import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentStatusEnum } from '../database/schemas/appointment.schema';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { Patient } from '../database/schemas/patient.schema';
import { Profile } from '../database/schemas/profile.schema';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
  ) {}

  private generateAppointmentNumber(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(Math.random() * 9000 + 1000);
    return `APT-${dateStr}-${random}`;
  }

  async create(dto: CreateAppointmentDto, userId?: string, branchId?: string): Promise<Appointment> {
    const patient = await this.patientModel.findById(dto.patientId);
    if (!patient) throw new NotFoundException('Patient not found');

    const doctor = await this.profileModel.findById(dto.doctorId);
    if (!doctor) throw new NotFoundException('Doctor not found');

    const appointmentDate = new Date(dto.date);
    if (appointmentDate < new Date(new Date().toDateString())) {
      throw new BadRequestException('Cannot schedule appointments in the past');
    }

    const existingQuery: any = {
      doctorId: new Types.ObjectId(dto.doctorId),
      date: appointmentDate,
      time: dto.time,
      status: { $in: [AppointmentStatusEnum.SCHEDULED, AppointmentStatusEnum.CHECKED_IN] },
    };
    if (branchId) existingQuery.branchId = branchId;

    const existing = await this.appointmentModel.findOne(existingQuery);

    if (existing) {
      throw new BadRequestException('Doctor already has an appointment at this time');
    }

    const appointmentData: any = {
      appointmentNumber: this.generateAppointmentNumber(),
      patientId: new Types.ObjectId(dto.patientId),
      doctorId: new Types.ObjectId(dto.doctorId),
      date: appointmentDate,
      time: dto.time,
      reason: dto.reason,
      notes: dto.notes,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    };
    if (branchId) appointmentData.branchId = branchId;

    const appointment = new this.appointmentModel(appointmentData);

    return appointment.save();
  }

  async findAll(filters?: {
    status?: string;
    doctorId?: string;
    patientId?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    branchId?: string;
  }): Promise<Appointment[]> {
    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.doctorId) query.doctorId = new Types.ObjectId(filters.doctorId);
    if (filters?.patientId) query.patientId = new Types.ObjectId(filters.patientId);
    if (filters?.branchId) query.branchId = filters.branchId;
    if (filters?.date) {
      const start = new Date(filters.date);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    if (filters?.startDate || filters?.endDate) {
      query.date = {};
      if (filters.startDate) query.date.$gte = new Date(filters.startDate);
      if (filters.endDate) query.date.$lte = new Date(filters.endDate);
    }

    return this.appointmentModel
      .find(query)
      .populate('patientId', 'firstName lastName patientId phone')
      .populate('doctorId', 'fullName department')
      .sort({ date: 1, time: 1 })
      .lean();
  }

  async findById(id: string, branchId?: string): Promise<Appointment> {
    const query: any = { _id: id };
    if (branchId) query.branchId = branchId;

    const appointment = await this.appointmentModel
      .findOne(query)
      .populate('patientId', 'firstName lastName patientId phone gender age')
      .populate('doctorId', 'fullName department')
      .lean();
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async update(id: string, dto: UpdateAppointmentDto, branchId?: string): Promise<Appointment> {
    const query: any = { _id: id };
    if (branchId) query.branchId = branchId;

    const appointment = await this.appointmentModel.findOne(query);
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (dto.status) {
      if (dto.status === AppointmentStatusEnum.CANCELLED) {
        appointment.cancelledAt = new Date();
        appointment.cancellationReason = dto.cancellationReason;
      }
      if (dto.status === AppointmentStatusEnum.COMPLETED) {
        appointment.completedAt = new Date();
      }
      appointment.status = dto.status;
    }

    if (dto.notes) appointment.notes = dto.notes;

    return appointment.save();
  }

  async checkIn(id: string, branchId?: string): Promise<Appointment> {
    const query: any = { _id: id };
    if (branchId) query.branchId = branchId;

    const appointment = await this.appointmentModel.findOne(query);
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.status !== AppointmentStatusEnum.SCHEDULED) {
      throw new BadRequestException('Can only check in scheduled appointments');
    }
    appointment.status = AppointmentStatusEnum.CHECKED_IN;
    appointment.checkedInAt = new Date();
    return appointment.save();
  }

  async getTodaySchedule(doctorId?: string, branchId?: string): Promise<Appointment[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const query: any = {
      date: { $gte: today, $lt: tomorrow },
      status: { $in: [AppointmentStatusEnum.SCHEDULED, AppointmentStatusEnum.CHECKED_IN] },
    };
    if (doctorId) query.doctorId = new Types.ObjectId(doctorId);
    if (branchId) query.branchId = branchId;

    return this.appointmentModel
      .find(query)
      .populate('patientId', 'firstName lastName patientId phone')
      .populate('doctorId', 'fullName department')
      .sort({ time: 1 })
      .lean();
  }

  async getUpcoming(patientId: string, branchId?: string): Promise<Appointment[]> {
    const now = new Date();
    const query: any = {
      patientId: new Types.ObjectId(patientId),
      date: { $gte: now },
      status: { $in: [AppointmentStatusEnum.SCHEDULED, AppointmentStatusEnum.CHECKED_IN] },
    };
    if (branchId) query.branchId = branchId;

    return this.appointmentModel
      .find(query)
      .populate('doctorId', 'fullName department')
      .sort({ date: 1, time: 1 })
      .lean();
  }
}
