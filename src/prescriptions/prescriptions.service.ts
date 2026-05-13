import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Prescription, PrescriptionStatusEnum } from '../database/schemas/prescription.schema';
import { Medication } from '../database/schemas/medication.schema';
import { Consultation } from '../database/schemas/consultation.schema';
import { Patient } from '../database/schemas/patient.schema';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectModel(Prescription.name) private prescriptionModel: Model<Prescription>,
    @InjectModel(Medication.name) private medicationModel: Model<Medication>,
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  async create(createPrescriptionDto: CreatePrescriptionDto): Promise<Prescription> {
    const { patientId, consultationId, visitId, doctorId, items, notes, totalAmount } = createPrescriptionDto;

    // Verify patient exists
    const patient = await this.patientModel.findById(patientId);
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (consultationId) {
      const consultation = await this.consultationModel.findById(consultationId);
      if (!consultation) {
        throw new NotFoundException('Consultation not found');
      }
    }

    // Check medication stock and update
    for (const item of items) {
      const medication = await this.medicationModel.findById(item.medicationId);
      if (!medication) {
        throw new NotFoundException(`Medication ${item.medicationName} not found`);
      }
      if (medication.stockQuantity < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${medication.name}`);
      }
    }

    // Generate prescription number
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const count = await this.prescriptionModel.countDocuments({
      createdAt: {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    });
    const prescriptionNumber = `RX-${dateStr}-${String(count + 1).padStart(4, '0')}`;

    const prescription = new this.prescriptionModel({
      prescriptionNumber,
      patientId: new Types.ObjectId(patientId),
      consultationId: consultationId ? new Types.ObjectId(consultationId) : undefined,
      visitId: visitId ? new Types.ObjectId(visitId) : undefined,
      doctorId: new Types.ObjectId(doctorId),
      items: items.map((item) => ({
        ...item,
        medicationId: new Types.ObjectId(item.medicationId),
      })),
      status: PrescriptionStatusEnum.PENDING,
      notes,
      isPaid: false,
      totalAmount,
    });

    const savedPrescription = await prescription.save();
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:created', populatedPrescription);
    return populatedPrescription;
  }

  async findAll(query: any = {}): Promise<Prescription[]> {
    return this.prescriptionModel
      .find(query)
      .populate('patientId', 'patientId firstName lastName')
      .populate('doctorId', 'fullName')
      .populate('items.medicationId', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<Prescription> {
    const prescription = await this.prescriptionModel
      .findById(id)
      .populate('patientId')
      .populate('doctorId')
      .populate('consultationId')
      .populate('items.medicationId')
      .exec();
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    return prescription;
  }

  /**
   * Get prescriptions awaiting payment — shown on Reception pending clinical orders
   */
  async findPendingPayment(): Promise<Prescription[]> {
    return this.prescriptionModel
      .find({ status: PrescriptionStatusEnum.PENDING, isPaid: false })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Get prescriptions paid and awaiting dispensing — shown on Pharmacy dashboard
   */
  async findPendingDispense(): Promise<Prescription[]> {
    return this.prescriptionModel
      .find({ status: PrescriptionStatusEnum.PENDING, isPaid: true })
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('doctorId', 'fullName')
      .populate('items.medicationId', 'name stockQuantity unitPrice')
      .sort({ createdAt: 1 })
      .exec();
  }

  async dispense(id: string, dispensedBy: string): Promise<Prescription> {
    const prescription = await this.prescriptionModel.findById(id);
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.status === PrescriptionStatusEnum.DISPENSED) {
      throw new BadRequestException('Prescription already dispensed');
    }

    if (!prescription.isPaid) {
      throw new BadRequestException('Prescription must be paid before dispensing');
    }

    // Check stock availability before deducting (atomic check)
    for (const item of prescription.items) {
      const medication = await this.medicationModel.findById(item.medicationId);
      if (!medication) {
        throw new NotFoundException(`Medication not found: ${item.medicationName}`);
      }
      if (medication.stockQuantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${medication.name}. Available: ${medication.stockQuantity}, Required: ${item.quantity}`,
        );
      }
    }

    // Deduct stock for each item
    for (const item of prescription.items) {
      await this.medicationModel.findByIdAndUpdate(item.medicationId, {
        $inc: { stockQuantity: -item.quantity },
      });
    }

    prescription.status = PrescriptionStatusEnum.DISPENSED;
    prescription.dispensedBy = new Types.ObjectId(dispensedBy);
    prescription.dispensedAt = new Date();

    const savedPrescription = await prescription.save();
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:dispensed', populatedPrescription);
    return populatedPrescription;
  }

  async markAsPaid(id: string): Promise<Prescription> {
    const prescription = await this.prescriptionModel.findById(id);
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    prescription.isPaid = true;
    const savedPrescription = await prescription.save();
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:paid', populatedPrescription);
    return populatedPrescription;
  }

  async cancel(id: string, reason: string, cancelledBy: string): Promise<Prescription> {
    const prescription = await this.prescriptionModel.findById(id);
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    prescription.status = PrescriptionStatusEnum.CANCELLED;
    prescription.cancelledAt = new Date();
    prescription.cancelledBy = new Types.ObjectId(cancelledBy);
    prescription.cancellationReason = reason;
    const savedPrescription = await prescription.save();
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:cancelled', populatedPrescription);
    return populatedPrescription;
  }
}
