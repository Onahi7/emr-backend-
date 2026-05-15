import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Prescription, PrescriptionStatusEnum } from '../database/schemas/prescription.schema';
import { Medication } from '../database/schemas/medication.schema';
import { StockMovement, StockMovementTypeEnum } from '../database/schemas/stock-movement.schema';
import { Consultation } from '../database/schemas/consultation.schema';
import { Patient } from '../database/schemas/patient.schema';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { DispensePrescriptionDto } from './dto/dispense-prescription.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectModel(Prescription.name) private prescriptionModel: Model<Prescription>,
    @InjectModel(Medication.name) private medicationModel: Model<Medication>,
    @InjectModel(StockMovement.name) private stockMovementModel: Model<StockMovement>,
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Auto-generate patient-facing label instructions from structured fields
   * when the doctor hasn't written them explicitly.
   *
   * Examples:
   *   oral    → "Take 1 tablet by mouth 3 times daily for 7 days"
   *   topical → "Apply 500mg to the affected area twice daily for 2 weeks"
   *   ophthalmic → "Instil 1 drop into the affected eye(s) every 6 hours for 5 days"
   *   IV      → "500mg intravenously every 8 hours for 3 days — administer as directed"
   */
  private generateLabelInstructions(item: {
    dosage: string;
    frequency: string;
    duration: string;
    route?: string;
    instructions?: string;
  }): string {
    // If the doctor already wrote instructions, use them as-is
    if (item.instructions?.trim()) {
      return item.instructions.trim();
    }

    const { dosage, frequency, duration, route } = item;

    switch (route) {
      case 'oral':
      case 'sublingual':
        return `Take ${dosage} by ${route === 'sublingual' ? 'placing under the tongue' : 'mouth'} ${frequency} for ${duration}`;
      case 'topical':
        return `Apply ${dosage} to the affected area ${frequency} for ${duration}`;
      case 'ophthalmic':
        return `Instil ${dosage} into the affected eye(s) ${frequency} for ${duration}`;
      case 'otic':
        return `Instil ${dosage} into the affected ear(s) ${frequency} for ${duration}`;
      case 'nasal':
        return `Spray ${dosage} into each nostril ${frequency} for ${duration}`;
      case 'inhalation':
        return `Inhale ${dosage} ${frequency} for ${duration}`;
      case 'rectal':
        return `Insert ${dosage} rectally ${frequency} for ${duration}`;
      case 'intravenous':
        return `${dosage} intravenously ${frequency} for ${duration} — administer as directed by healthcare provider`;
      case 'intramuscular':
        return `${dosage} by intramuscular injection ${frequency} for ${duration} — administer as directed`;
      case 'subcutaneous':
        return `${dosage} by subcutaneous injection ${frequency} for ${duration} — administer as directed`;
      default:
        return `${dosage} ${frequency} for ${duration}`;
    }
  }

  async create(createPrescriptionDto: CreatePrescriptionDto, prescribedBy?: string): Promise<Prescription> {
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
      // Ensure the consultation belongs to the same patient
      if (consultation.patientId.toString() !== patientId) {
        throw new BadRequestException('Consultation does not belong to the specified patient');
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
      doctorId: doctorId ? new Types.ObjectId(doctorId) : undefined,
      prescribedBy: prescribedBy ? new Types.ObjectId(prescribedBy) : undefined,
      items: items.map((item) => ({
        ...item,
        medicationId: new Types.ObjectId(item.medicationId),
        // Always store resolved label instructions so the pharmacist
        // and the dispensing label always have clear patient directions
        instructions: this.generateLabelInstructions(item),
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
      .populate('prescribedBy', 'fullName email')
      .populate('doctorId', 'fullName')
      .populate('items.medicationId', 'name stockQuantity unitPrice medicationCode dosageForm strength')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<Prescription> {
    const prescription = await this.prescriptionModel
      .findById(id)
      .populate('patientId')
      .populate('prescribedBy', 'fullName email department')
      .populate('doctorId')
      .populate('consultationId')
      .populate('dispensedBy', 'fullName email')
      .populate('cancelledBy', 'fullName email')
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
      .populate('prescribedBy', 'fullName')
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
      .populate('prescribedBy', 'fullName')
      .populate('doctorId', 'fullName')
      .populate('items.medicationId', 'name stockQuantity unitPrice')
      .sort({ createdAt: 1 })
      .exec();
  }

  async dispense(
    id: string,
    dispensedBy: string,
    dto?: DispensePrescriptionDto,
  ): Promise<Prescription> {
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

    // Atomically deduct stock for each item using findOneAndUpdate with a
    // stock-sufficiency condition. This prevents the race condition where two
    // concurrent dispenses both pass the read-check but both deduct.
    for (const item of prescription.items) {
      const updated = await this.medicationModel.findOneAndUpdate(
        {
          _id: item.medicationId,
          stockQuantity: { $gte: item.quantity }, // only update if enough stock
        },
        { $inc: { stockQuantity: -item.quantity } },
        { new: true },
      );

      if (!updated) {
        // Either medication not found or insufficient stock at deduction time
        const med = await this.medicationModel.findById(item.medicationId).lean();
        if (!med) {
          throw new NotFoundException(`Medication not found: ${item.medicationName}`);
        }
        throw new BadRequestException(
          `Insufficient stock for ${med.name}. ` +
          `Available: ${med.stockQuantity}, Required: ${item.quantity}`,
        );
      }

      // Create StockMovement audit record for this dispense
      const stockBefore = updated.stockQuantity + item.quantity; // before deduction
      await this.stockMovementModel.create({
        medicationId: item.medicationId,
        movementType: StockMovementTypeEnum.DISPENSE,
        quantity: -item.quantity,
        prescriptionId: prescription._id,
        stockBefore,
        stockAfter: updated.stockQuantity,
        notes: `Dispensed for prescription ${prescription.prescriptionNumber}`,
        performedBy: new Types.ObjectId(dispensedBy),
      });
    }

    prescription.status = PrescriptionStatusEnum.DISPENSED;
    prescription.dispensedBy = new Types.ObjectId(dispensedBy);
    prescription.dispensedAt = new Date();
    if (dto?.dispensingNotes) {
      prescription.dispensingNotes = dto.dispensingNotes;
    }

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
