import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SoapNote, SoapNoteTypeEnum } from '../database/schemas/soap-note.schema';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';

@Injectable()
export class SoapNotesService {
  constructor(
    @InjectModel(SoapNote.name) private soapNoteModel: Model<SoapNote>,
  ) {}

  async create(createSoapNoteDto: CreateSoapNoteDto): Promise<SoapNote> {
    const soapNote = new this.soapNoteModel({
      ...createSoapNoteDto,
      patientId: new Types.ObjectId(createSoapNoteDto.patientId),
      consultationId: createSoapNoteDto.consultationId ? new Types.ObjectId(createSoapNoteDto.consultationId) : undefined,
      visitId: createSoapNoteDto.visitId ? new Types.ObjectId(createSoapNoteDto.visitId) : undefined,
      doctorId: createSoapNoteDto.doctorId ? new Types.ObjectId(createSoapNoteDto.doctorId) : undefined,
      nurseId: createSoapNoteDto.nurseId ? new Types.ObjectId(createSoapNoteDto.nurseId) : undefined,
    });
    return soapNote.save();
  }

  async findAll(query: any = {}): Promise<SoapNote[]> {
    return this.soapNoteModel
      .find(query)
      .populate('patientId', 'firstName lastName patientId')
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .populate('consultationId', 'consultationNumber')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<SoapNote> {
    const soapNote = await this.soapNoteModel
      .findById(id)
      .populate('patientId')
      .populate('doctorId')
      .populate('nurseId')
      .populate('consultationId')
      .exec();
    if (!soapNote) {
      throw new NotFoundException('SOAP note not found');
    }
    return soapNote;
  }

  async findByPatient(patientId: string): Promise<SoapNote[]> {
    return this.soapNoteModel
      .find({ patientId: new Types.ObjectId(patientId) })
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .populate('consultationId', 'consultationNumber')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByConsultation(consultationId: string): Promise<SoapNote[]> {
    return this.soapNoteModel
      .find({ consultationId: new Types.ObjectId(consultationId) })
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .exec();
  }

  async findByVisit(visitId: string): Promise<SoapNote[]> {
    return this.soapNoteModel
      .find({ visitId: new Types.ObjectId(visitId) })
      .populate('doctorId', 'fullName')
      .populate('nurseId', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(id: string, updateSoapNoteDto: UpdateSoapNoteDto): Promise<SoapNote> {
    const soapNote = await this.soapNoteModel.findById(id);
    if (!soapNote) {
      throw new NotFoundException('SOAP note not found');
    }
    Object.assign(soapNote, updateSoapNoteDto);
    return soapNote.save();
  }

  async sign(id: string, signedBy: string): Promise<SoapNote> {
    const soapNote = await this.soapNoteModel.findById(id);
    if (!soapNote) {
      throw new NotFoundException('SOAP note not found');
    }
    soapNote.isSigned = true;
    soapNote.signedAt = new Date();
    soapNote.signedBy = new Types.ObjectId(signedBy);
    return soapNote.save();
  }
}
