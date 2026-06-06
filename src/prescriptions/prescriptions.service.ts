import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Prescription, PrescriptionStatusEnum } from '../database/schemas/prescription.schema';
import { Medication } from '../database/schemas/medication.schema';
import { StockMovement, StockMovementTypeEnum } from '../database/schemas/stock-movement.schema';
import { Consultation } from '../database/schemas/consultation.schema';
import { Patient } from '../database/schemas/patient.schema';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { DispensePrescriptionDto } from './dto/dispense-prescription.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CafIntegrationService } from '../caf-integration/caf-integration.service';

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectModel(Prescription.name) private prescriptionModel: Model<Prescription>,
    @InjectModel(Medication.name) private medicationModel: Model<Medication>,
    @InjectModel(StockMovement.name) private stockMovementModel: Model<StockMovement>,
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private realtimeGateway: RealtimeGateway,
    private cafIntegrationService: CafIntegrationService,
  ) {}

  private async moveVisitToStatus(visitId: Types.ObjectId | string | undefined, status: VisitStatusEnum): Promise<void> {
    if (!visitId) return;
    const visit = await this.visitModel.findById(visitId);
    if (!visit) return;
    if ([VisitStatusEnum.COMPLETED, VisitStatusEnum.CANCELLED].includes(visit.status)) return;
    if (visit.status === status) return;
    visit.status = status;
    await visit.save();
    this.realtimeGateway.emitToAll('visit:status_updated', { visitId: visit._id, status });
  }

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

  async create(createPrescriptionDto: CreatePrescriptionDto, prescribedBy?: string, branchId?: string): Promise<Prescription> {
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

    // Check medication stock — local meds or CAF products
    for (const item of items) {
      const medication = await this.medicationModel.findById(item.medicationId).lean();
      if (!medication) {
        if (this.cafIntegrationService.isConfigured()) {
          const cafStock = await this.cafIntegrationService.getProductStock(item.medicationId);
          if (cafStock < item.quantity) {
            throw new BadRequestException(
              `Insufficient CAF stock for ${item.medicationName}. Available: ${cafStock}, Required: ${item.quantity}`,
            );
          }
        }
        continue;
      }
      if (medication.stockQuantity < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${medication.name}`);
      }
    }

    // Generate prescription number
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const countFilter: any = {
      createdAt: {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    };
    if (branchId) countFilter.branchId = branchId;
    const count = await this.prescriptionModel.countDocuments(countFilter);
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
      branchId,
    });

    const savedPrescription = await prescription.save();
    await this.moveVisitToStatus(savedPrescription.visitId, VisitStatusEnum.AWAITING_PHARMACY);
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:created', populatedPrescription);
    return populatedPrescription;
  }

  async findAll(query: any = {}, branchId?: string): Promise<Prescription[]> {
    const filter = branchId ? { ...query, branchId } : query;
    return this.prescriptionModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName')
      .populate('prescribedBy', 'fullName email')
      .populate('doctorId', 'fullName')
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
      .exec();
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    return prescription;
  }

  /**
   * Get prescriptions awaiting payment — shown on Reception pending clinical orders
   */
  async findPendingPayment(branchId?: string): Promise<Prescription[]> {
    const filter: any = { status: PrescriptionStatusEnum.PENDING, isPaid: false };
    if (branchId) filter.branchId = branchId;
    return this.prescriptionModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('prescribedBy', 'fullName')
      .populate('doctorId', 'fullName')
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Get prescriptions paid and awaiting dispensing — shown on Pharmacy dashboard
   */
  async findPendingDispense(branchId?: string): Promise<Prescription[]> {
    const filter: any = { status: PrescriptionStatusEnum.PENDING, isPaid: true };
    if (branchId) filter.branchId = branchId;
    return this.prescriptionModel
      .find(filter)
      .populate('patientId', 'patientId firstName lastName age gender phone')
      .populate('prescribedBy', 'fullName')
      .populate('doctorId', 'fullName')
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

    // Separate CAF-sourced items from local items
    const cafItems: Array<{ medicationId: Types.ObjectId; quantity: number; medicationName: string }> = [];
    const localItems: Array<{ medicationId: Types.ObjectId; quantity: number; medicationName: string }> = [];

    if (this.cafIntegrationService.isConfigured()) {
      for (const item of prescription.items) {
        const localMed = await this.medicationModel.findById(item.medicationId).lean();
        if (!localMed) {
          cafItems.push(item);
        } else {
          localItems.push(item);
        }
      }
    } else {
      localItems.push(...prescription.items);
    }

    // Deduct local items from EMR stock
    for (const item of localItems) {
      const updated = await this.medicationModel.findOneAndUpdate(
        {
          _id: item.medicationId,
          stockQuantity: { $gte: item.quantity },
        },
        { $inc: { stockQuantity: -item.quantity } },
        { new: true },
      );

      if (!updated) {
        const med = await this.medicationModel.findById(item.medicationId).lean();
        if (!med) {
          throw new NotFoundException(`Medication not found: ${item.medicationName}`);
        }
        throw new BadRequestException(
          `Insufficient stock for ${med.name}. Available: ${med.stockQuantity}, Required: ${item.quantity}`,
        );
      }

      const stockBefore = updated.stockQuantity + item.quantity;
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

    // Deduct CAF items via CAF checkout
    let cafSaleId: string | undefined;
    let cafReceiptNumber: string | undefined;

    if (cafItems.length > 0 && this.cafIntegrationService.isConfigured()) {
      const shiftId = await this.cafIntegrationService.ensureOpenShift();
      const patient = prescription.patientId
        ? await this.patientModel.findById(prescription.patientId).lean()
        : null;
      const patientName = patient
        ? `${(patient as any).firstName || ''} ${(patient as any).lastName || ''}`.trim() || 'EMR Patient'
        : 'EMR Patient';

      const result = await this.cafIntegrationService.dispensePrescription({
        shiftId,
        items: cafItems.map((item) => ({
          productId: item.medicationId.toString(),
          quantity: item.quantity,
        })),
        patientName,
        prescriptionRef: prescription.prescriptionNumber,
        paymentMethod: dto?.paymentMethod || 'cash',
        notes: dto?.dispensingNotes,
      });

      cafSaleId = result.saleId;
      cafReceiptNumber = result.receiptNumber;
    }

    prescription.status = PrescriptionStatusEnum.DISPENSED;
    prescription.dispensedBy = new Types.ObjectId(dispensedBy);
    prescription.dispensedAt = new Date();
    if (dto?.dispensingNotes) {
      prescription.dispensingNotes = dto.dispensingNotes;
    }
    if (cafSaleId) {
      prescription.cafSaleId = cafSaleId;
    }
    if (cafReceiptNumber) {
      prescription.cafReceiptNumber = cafReceiptNumber;
    }
    if (cafItems.length > 0) {
      prescription.hasCafItems = true;
    }

    const savedPrescription = await prescription.save();
    await this.moveVisitToStatus(savedPrescription.visitId, VisitStatusEnum.AWAITING_DOCTOR_REVIEW);
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:dispensed', populatedPrescription);
    return populatedPrescription;
  }

  async markAsPaid(id: string, paymentMethod: string = 'cash', userId?: string, branchId?: string): Promise<Prescription> {
    const prescription = await this.prescriptionModel.findOne({ _id: id, ...(branchId ? { branchId } : {}) });
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    if (prescription.isPaid) {
      throw new BadRequestException('Prescription is already paid');
    }
    prescription.isPaid = true;
    const savedPrescription = await prescription.save();

    // Create payment record for the payments collection
    const payment = new this.paymentModel({
      branchId: prescription.branchId || branchId,
      paymentType: PaymentTypeEnum.PRESCRIPTION,
      amount: prescription.totalAmount || 0,
      paymentMethod,
      visitId: prescription.visitId,
      prescriptionId: prescription._id,
      receivedBy: userId ? new Types.ObjectId(userId) : undefined,
      notes: `Prescription ${prescription.prescriptionNumber} paid`,
      isRefunded: false,
    });
    await payment.save();

    await this.moveVisitToStatus(savedPrescription.visitId, VisitStatusEnum.AWAITING_DISPENSING);
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:paid', populatedPrescription);
    return populatedPrescription;
  }

  /**
   * Update prescription — items, notes, totalAmount.
   * Only allowed while the prescription is pending and unpaid.
   */
  async update(id: string, updateDto: any): Promise<Prescription> {
    const prescription = await this.prescriptionModel.findById(id);
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.status !== PrescriptionStatusEnum.PENDING) {
      throw new BadRequestException(
        `Cannot edit prescription in "${prescription.status}" status. Only pending prescriptions can be edited.`,
      );
    }

    if (prescription.isPaid) {
      throw new BadRequestException('Cannot edit a prescription that has already been paid');
    }

    // Replace items if provided
    if (updateDto.items && updateDto.items.length > 0) {
      prescription.items = updateDto.items.map((item: any) => ({
        medicationId: new Types.ObjectId(item.medicationId),
        medicationName: item.medicationName,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity,
        route: item.route || 'oral',
        instructions: this.generateLabelInstructions(item),
        pharmacistNote: item.pharmacistNote,
      }));
    }

    // Update notes
    if (updateDto.notes !== undefined) {
      prescription.notes = updateDto.notes;
    }

    // Update total
    if (updateDto.totalAmount !== undefined) {
      prescription.totalAmount = updateDto.totalAmount;
    } else if (updateDto.items) {
      // Recalculate from items if items changed but total not explicitly provided
      prescription.totalAmount = prescription.items.reduce(
        (sum, item) => sum + item.quantity * 0, 0,
      );
    }

    const savedPrescription = await prescription.save();
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:updated', populatedPrescription);
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
