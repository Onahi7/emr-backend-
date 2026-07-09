import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor } from '../database/schemas/doctor.schema';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectModel(Doctor.name) private doctorModel: Model<Doctor>,
  ) {}

  private async validateUserId(userId?: string): Promise<Types.ObjectId | undefined> {
    if (!userId) return undefined;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const ProfileModel = this.doctorModel.db.model('Profile');
    const profile = await ProfileModel.findById(userId).exec();
    if (!profile) {
      throw new BadRequestException('Linked user profile not found');
    }
    const existing = await this.doctorModel.findOne({ userId: new Types.ObjectId(userId), isActive: true }).exec();
    if (existing) {
      throw new BadRequestException(`User is already linked to doctor ${existing.fullName}`);
    }
    return new Types.ObjectId(userId);
  }

  async create(createDoctorDto: CreateDoctorDto) {
    const name = createDoctorDto.fullName.trim();
    if (!name) throw new BadRequestException('Doctor name is required');

    const existing = await this.doctorModel.findOne({
      fullName: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (existing) return existing;

    const userObjectId = await this.validateUserId(createDoctorDto.userId);

    const doctor = new this.doctorModel({
      ...createDoctorDto,
      fullName: name,
      userId: userObjectId,
    });
    return doctor.save();
  }

  async findAll(search?: string, activeOnly: boolean = true, branchId?: string) {
    const filter: any = {};
    if (activeOnly) filter.isActive = true;
    if (search) {
      filter.fullName = { $regex: search, $options: 'i' };
    }

    const doctors = await this.doctorModel.find(filter).sort({ fullName: 1 }).lean();
    if (!branchId) return doctors;

    const ProfileModel = this.doctorModel.db.model('Profile');
    const linkedUserIds = doctors
      .map((doctor: any) => doctor.userId)
      .filter(Boolean);
    const profiles = linkedUserIds.length
      ? await ProfileModel.find({ _id: { $in: linkedUserIds } }).select('_id branchId branchIds').lean()
      : [];
    const profileById = new Map(profiles.map((profile: any) => [profile._id.toString(), profile]));

    return doctors.filter((doctor: any) => {
      if (!doctor.userId) return true;
      const profile = profileById.get(doctor.userId.toString());
      if (!profile) return true;
      return (
        profile.branchId?.toString() === branchId ||
        (Array.isArray(profile.branchIds) && profile.branchIds.some((id: any) => id?.toString() === branchId))
      );
    });
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
    if (patch.userId !== undefined) {
      if (patch.userId === null || patch.userId === '') {
        patch.userId = undefined;
      } else {
        const existing = await this.doctorModel.findOne({
          userId: new Types.ObjectId(patch.userId),
          isActive: true,
          _id: { $ne: new Types.ObjectId(id) },
        }).exec();
        if (existing) {
          throw new BadRequestException(`User is already linked to doctor ${existing.fullName}`);
        }
        const ProfileModel = this.doctorModel.db.model('Profile');
        const profile = await ProfileModel.findById(patch.userId).exec();
        if (!profile) {
          throw new BadRequestException('Linked user profile not found');
        }
        patch.userId = new Types.ObjectId(patch.userId);
      }
    }

    const doctor = await this.doctorModel.findByIdAndUpdate(id, patch, { new: true }).lean();
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }
}
