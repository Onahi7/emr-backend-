import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(PrescriptionsService.name);

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
    const visit = await this.visitModel.findById(visitId).lean();
    if (!visit) return;
    if ([VisitStatusEnum.COMPLETED, VisitStatusEnum.CANCELLED].includes(visit.status)) return;
    if (visit.status === status) return;
    await this.visitModel.findByIdAndUpdate(visitId, { $set: { status } });
    this.realtimeGateway.emitToAll('visit:status_updated', { visitId, status });
  }

  /**
   * Parse the numeric count from a strength string like "500mg", "1 tablet", "2 ampules".
   * Returns 1 if no count can be parsed (e.g. "500mg" alone).
   * Examples:
   *   "500mg"           → 1   (one tablet, just labelled by strength)
   *   "1 tablet"        → 1
   *   "2 tablets"       → 2
   *   "2 ampules"       → 2
   *   "1 ampule"        → 1
   *   "5 ml"            → 5
   *   "0.5 tablet"      → 0.5 (halved tablet)
   */
  private parseUnitsPerDose(strength: string): number {
    if (!strength) return 1;
    const s = strength.trim().toLowerCase();
    // Match leading number (with optional decimal)
    const m = s.match(/^(\d+(?:\.\d+)?)/);
    if (m) {
      const n = parseFloat(m[1]);
      // If the next word is one of these explicit unit words, treat as count
      const rest = s.slice(m[0].length).trim();
      const countUnits = ['tablet', 'tablets', 'capsule', 'capsules', 'ampule', 'ampules', 'vial', 'vials', 'patch', 'patches', 'drop', 'drops', 'puff', 'puffs', 'sachet', 'sachets', 'ml'];
      if (countUnits.some((u) => rest.startsWith(u))) {
        return n;
      }
      // Otherwise (e.g. "500mg") it's a strength label — default to 1
      return 1;
    }
    return 1;
  }

  /**
   * Compute the prescription total at creation time using local medication prices.
   * Each item's total = quantity × unitPrice. Falls back to packSizes if unitPrice is 0.
   */
  private async computePrescriptionTotal(items: any[]): Promise<number> {
    let total = 0;
    for (const item of items) {
      const med = await this.medicationModel.findById(item.medicationId).lean();
      if (!med) continue;
      let price = med.unitPrice;
      if ((!price || price === 0) && med.packSizes && med.packSizes.length > 0) {
        const def = med.packSizes.find((p) => p.isDefault) || med.packSizes[0];
        price = def.unitsPerPack > 0 ? def.sellingPrice / def.unitsPerPack : 0;
      }
      total += item.quantity * (price || 0);
    }
    return total;
  }

  /**
   * Convert dosesPerDay to a human-readable frequency string.
   * 1 → "once daily", 2 → "twice daily", 3 → "3 times daily",
   * 4 → "4 times daily", 6 → "every 4 hours", 8 → "every 3 hours",
   * 12 → "every 2 hours", 24 → "every hour", else "{n} times daily"
   */
  private frequencyFromDosesPerDay(dosesPerDay: number): string {
    if (dosesPerDay === 1) return 'once daily';
    if (dosesPerDay === 2) return 'twice daily';
    if (dosesPerDay === 3) return '3 times daily';
    if (dosesPerDay === 4) return '4 times daily';
    if (dosesPerDay === 6) return 'every 4 hours';
    if (dosesPerDay === 8) return 'every 3 hours';
    if (dosesPerDay === 12) return 'every 2 hours';
    if (dosesPerDay === 24) return 'every hour';
    return `${dosesPerDay} times daily`;
  }

  /**
   * Convert durationDays to a human-readable string.
   * 1 → "1 day", 7 → "1 week", 14 → "2 weeks", 30 → "1 month", else "{n} days"
   */
  private durationFromDays(days: number): string {
    if (days === 1) return '1 day';
    if (days === 7) return '1 week';
    if (days === 14) return '2 weeks';
    if (days === 21) return '3 weeks';
    if (days === 28) return '4 weeks';
    if (days === 30) return '1 month';
    if (days === 60) return '2 months';
    if (days === 90) return '3 months';
    return `${days} days`;
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

    // === Auto-compute quantity from structured regimen if not provided ===
    // For each item: quantity = dosesPerDay × durationDays × unitsPerDose
    // unitsPerDose is parsed from strengthPerDose (e.g. "2 ampules" → 2, "1 tablet" → 1, "500mg" → 1)
    const normalizedItems = items.map((item) => {
      const unitsPerDose = this.parseUnitsPerDose(item.strengthPerDose);
      const computedQuantity = unitsPerDose * item.dosesPerDay * item.durationDays;
      return {
        ...item,
        // If the DTO provided quantity, trust it (handles "1 tablet twice daily" where parse fails).
        // Otherwise use the computed value.
        quantity: item.quantity > 0 ? item.quantity : computedQuantity,
      };
    });

    // Auto-compute total from local prices if not provided
    const computedTotal = totalAmount ?? (await this.computePrescriptionTotal(normalizedItems));

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
    for (const item of normalizedItems) {
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
        throw new BadRequestException(
          `Insufficient stock for ${medication.name}. Available: ${medication.stockQuantity} ${medication.baseUnit}, Required: ${item.quantity}`,
        );
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
      items: normalizedItems.map((item) => {
        // Auto-fill legacy free-text fields from the structured regimen
        // so the existing label-printing code (generateLabelInstructions) keeps working
        const dosage = item.dosage || item.strengthPerDose;
        const frequency = item.frequency || this.frequencyFromDosesPerDay(item.dosesPerDay);
        const duration = item.duration || this.durationFromDays(item.durationDays);
        return {
          ...item,
          medicationId: new Types.ObjectId(item.medicationId),
          dosage,
          frequency,
          duration,
          // Always store resolved label instructions so the pharmacist
          // and the dispensing label always have clear patient directions
          instructions: this.generateLabelInstructions({
            dosage,
            frequency,
            duration,
            route: item.route,
            instructions: item.instructions,
          }),
        };
      }),
      status: PrescriptionStatusEnum.PENDING,
      notes,
      isPaid: false,
      totalAmount: computedTotal,
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
    try {
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

    // Build the per-item dispense plan: merge prescription items with receptionist
    // selections (dispense mode, pack, sell units, substitute).
    type DispenseLine = {
      prescriptionItem: typeof prescription.items[0];
      // What to actually dispense
      dispenseMode: 'individual' | 'pack';
      packSizeIndex?: number;
      sellUnits: number; // number of sell units to dispense
      baseUnits: number; // derived = sellUnits × unitsPerPack (or sellUnits in individual mode)
      // Medication being dispensed (could be a substitute)
      medicationId: Types.ObjectId;
      medicationName: string;
      // Pricing
      pricePerSellUnit: number;
      lineTotal: number;
      // Substitute tracking
      isSubstitute: boolean;
    };

    const lines: DispenseLine[] = [];
    let actualTotal = 0;

    for (const item of prescription.items) {
      // Find the receptionist's dispense record for this item
      const override = dto?.items?.find((d) => d.medicationId === item.medicationId.toString());

      const dispenseMode = override?.dispenseMode || 'individual';
      const packSizeIndex = override?.packSizeIndex;

      // Resolve the actual medication (substitute-aware)
      const actualMedicationId = override?.substituteMedicationId
        ? new Types.ObjectId(override.substituteMedicationId)
        : item.medicationId;
      const medication = await this.medicationModel.findById(actualMedicationId).lean();
      const medicationName = medication?.name || item.medicationName;
      const isSubstitute = !!override?.substituteMedicationId;

      let sellUnits: number;
      let baseUnits: number;
      let pricePerSellUnit: number;
      let packName: string | undefined;

      if (dispenseMode === 'pack') {
        if (
          packSizeIndex == null ||
          !medication?.packSizes ||
          !medication.packSizes[packSizeIndex]
        ) {
          throw new BadRequestException(
            `No pack selected for ${medicationName}. Pick a pack size or switch to individual mode.`,
          );
        }
        const pack = medication.packSizes[packSizeIndex];
        sellUnits = override?.sellUnits ?? 0;
        baseUnits = sellUnits * pack.unitsPerPack;
        pricePerSellUnit = pack.sellingPrice;
        packName = pack.name;
      } else {
        // Individual mode: sell units = base units, price per base unit
        sellUnits = override?.sellUnits ?? item.quantity;
        baseUnits = sellUnits;
        pricePerSellUnit = medication?.unitPrice ?? 0;
      }

      const lineTotal = sellUnits * pricePerSellUnit;
      actualTotal += lineTotal;

      // Persist dispense data back onto the prescription item
      item.dispenseMode = dispenseMode;
      item.packSizeIndex = packSizeIndex;
      item.dispensedPackName = packName;
      item.dispensedBaseUnits = baseUnits;
      item.dispensedSellUnits = sellUnits;
      item.priceAtDispense = pricePerSellUnit;
      item.lineTotalAtDispense = lineTotal;
      if (isSubstitute) {
        item.substituteForId = item.medicationId;
        item.substituteForName = item.medicationName;
        item.medicationId = actualMedicationId;
        item.medicationName = medicationName;
      }

      lines.push({
        prescriptionItem: item,
        dispenseMode,
        packSizeIndex,
        sellUnits,
        baseUnits,
        medicationId: actualMedicationId,
        medicationName,
        pricePerSellUnit,
        lineTotal,
        isSubstitute,
      });
    }

    // === Stock deduction (local + CAF) ===
    for (const line of lines) {
      if (line.baseUnits <= 0) continue; // 0 qty means nothing to deduct

      // Try local first
      const localMed = await this.medicationModel.findById(line.medicationId).lean();
      if (localMed && !localMed.isCafSourced) {
        const updated = await this.medicationModel.findOneAndUpdate(
          { _id: line.medicationId, stockQuantity: { $gte: line.baseUnits } },
          { $inc: { stockQuantity: -line.baseUnits } },
          { new: true },
        );
        if (!updated) {
          throw new BadRequestException(
            `Insufficient stock for ${line.medicationName}. Available: ${localMed.stockQuantity} ${localMed.baseUnit}, Required: ${line.baseUnits}`,
          );
        }
        await this.stockMovementModel.create({
          medicationId: line.medicationId,
          movementType: StockMovementTypeEnum.DISPENSE,
          quantity: -line.baseUnits,
          prescriptionId: prescription._id,
          stockBefore: updated.stockQuantity + line.baseUnits,
          stockAfter: updated.stockQuantity,
          notes: `Dispensed for ${prescription.prescriptionNumber}${line.isSubstitute ? ' (substitute)' : ''}`,
          performedBy: new Types.ObjectId(dispensedBy),
        });
      } else {
        // CAF-sourced or local-not-found — deduct via CAF checkout
        if (!this.cafIntegrationService.isConfigured()) {
          throw new BadRequestException(
            `Cannot dispense ${line.medicationName} — no local stock and CAF is not configured.`,
          );
        }
      }
    }

    // === Single CAF checkout call for all CAF-sourced lines ===
    const cafOnlyLines = lines.filter((l) => {
      // The deduction above handled local stock. CAF checkout runs for everything
      // that has sellUnits > 0 and is sourced from CAF (or substitute for a CAF med).
      return l.sellUnits > 0;
    });

    let cafSaleId: string | undefined;
    let cafReceiptNumber: string | undefined;

    if (cafOnlyLines.length > 0 && this.cafIntegrationService.isConfigured()) {
      const shiftId = await this.cafIntegrationService.ensureOpenShift();
      const patient = prescription.patientId
        ? await this.patientModel.findById(prescription.patientId).lean()
        : null;
      const patientName = patient
        ? `${(patient as any).firstName || ''} ${(patient as any).lastName || ''}`.trim() || 'EMR Patient'
        : 'EMR Patient';

      const result = await this.cafIntegrationService.dispensePrescription({
        shiftId,
        items: cafOnlyLines.map((l) => ({
          productId: l.medicationId.toString(),
          quantity: l.sellUnits,
        })),
        patientName,
        prescriptionRef: prescription.prescriptionNumber,
        paymentMethod: dto?.paymentMethod || 'cash',
        notes: dto?.dispensingNotes,
      });

      cafSaleId = result.saleId;
      cafReceiptNumber = result.receiptNumber;
    }

    // === Mark prescription dispensed ===
    prescription.status = PrescriptionStatusEnum.DISPENSED;
    prescription.dispensedBy = new Types.ObjectId(dispensedBy);
    prescription.dispensedAt = new Date();
    prescription.actualTotalAmount = actualTotal;
    if (dto?.dispensingNotes) {
      prescription.dispensingNotes = dto.dispensingNotes;
    }
    if (cafSaleId) prescription.cafSaleId = cafSaleId;
    if (cafReceiptNumber) prescription.cafReceiptNumber = cafReceiptNumber;
    if (cafOnlyLines.length > 0) prescription.hasCafItems = true;

    const savedPrescription = await prescription.save();
    await this.moveVisitToStatus(savedPrescription.visitId, VisitStatusEnum.AWAITING_DOCTOR_REVIEW);
    const populatedPrescription = await this.findById(savedPrescription._id.toString());
    this.realtimeGateway.emitToAll('prescription:dispensed', populatedPrescription);
    return populatedPrescription;
    } catch (error: any) {
      this.logger.error(`Dispense failed for prescription ${id}: ${error?.message}`, error?.stack);
      // Re-throw as BadRequestException so we get a real status code + message in the response
      const msg = error?.message || 'Unknown dispense error';
      if (error?.name === 'ValidationError' || error?.name === 'CastError') {
        throw new BadRequestException(`Validation: ${msg}`);
      }
      throw new BadRequestException(`Dispense error: ${msg}`);
    }
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
