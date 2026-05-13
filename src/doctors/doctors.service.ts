import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '../database/schemas/doctor.schema';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(@InjectModel(Doctor.name) private doctorModel: Model<Doctor>) {}

  async create(createDoctorDto: CreateDoctorDto) {
    const name = createDoctorDto.fullName.trim();
    if (!name) throw new BadRequestException('Doctor name is required');

    const existing = await this.doctorModel.findOne({
      fullName: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (existing) return existing;

    const doctor = new this.doctorModel({
      ...createDoctorDto,
      fullName: name,
    });
    return doctor.save();
  }

  async findAll(search?: string, activeOnly: boolean = true) {
    const filter: any = {};
    if (activeOnly) filter.isActive = true;
    if (search) {
      filter.fullName = { $regex: search, $options: 'i' };
    }

    return this.doctorModel.find(filter).sort({ fullName: 1 }).lean();
  }

  async findSpecialists(specialty?: string) {
    const filter: any = { isActive: true, doctorType: 'specialist' };
    if (specialty) filter.specialty = specialty;
    return this.doctorModel.find(filter).sort({ fullName: 1 }).lean();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Doctor not found');
    }

    const doctor = await this.doctorModel.findById(id).lean();
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async update(id: string, updateDoctorDto: UpdateDoctorDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Doctor not found');
    }

    const patch: any = { ...updateDoctorDto };
    if (typeof patch.fullName === 'string') {
      patch.fullName = patch.fullName.trim();
    }

    const doctor = await this.doctorModel.findByIdAndUpdate(id, patch, { new: true }).lean();
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }
}
