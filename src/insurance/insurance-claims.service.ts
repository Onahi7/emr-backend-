import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InsuranceClaim, InsuranceClaimDocument, ClaimStatusEnum, ClaimItemTypeEnum } from '../database/schemas/insurance-claim.schema';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';
import { Order, OrderStatusEnum, PaymentStatusEnum } from '../database/schemas/order.schema';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { CreateInsuranceClaimDto, UpdateClaimStatusDto, AddClaimItemDto } from './dto/create-insurance-claim.dto';
import { InsuranceBlock, InsuranceBlockDocument } from '../database/schemas/insurance-block.schema';
import { withBranch, requireBranchId } from '../common/utils/branch-scope';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class InsuranceClaimsService {
  private readonly logger = new Logger(InsuranceClaimsService.name);

  constructor(
    @InjectModel(InsuranceClaim.name) private claimModel: Model<InsuranceClaimDocument>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(InsuranceBlock.name) private blockModel: Model<InsuranceBlockDocument>,
    private ordersService: OrdersService,
  ) {}

  private async findActiveInsuranceBlock(patientId?: any, memberNumber?: string, programCode?: string, branchId?: string) {
    if (!programCode || (!patientId && !memberNumber)) return null;

    const query: any = {
      ...withBranch({}, branchId),
      isActive: true,
      programCode,
      $or: [],
    };

    const patientIdString = patientId?.toString?.() || patientId;
    if (patientIdString && Types.ObjectId.isValid(patientIdString)) {
      query.$or.push({ patientId: new Types.ObjectId(patientIdString) });
    }
    if (memberNumber) {
      query.$or.push({ memberNumber });
    }

    if (query.$or.length === 0) return null;
    return this.blockModel.findOne(query).lean().exec();
  }

  private assertNotBlocked(block: any) {
    if (block) {
      throw new BadRequestException('Insurance coverage is blocked for this patient/member.');
    }
  }

  async create(dto: CreateInsuranceClaimDto, createdBy?: string, branchId?: string): Promise<InsuranceClaim> {
    const requiredBranchId = requireBranchId(branchId);
    const visit = await this.visitModel.findOne(withBranch({ _id: dto.visitId }, requiredBranchId));
    if (!visit) throw new NotFoundException('Visit not found');
    this.assertNotBlocked(await this.findActiveInsuranceBlock(dto.patientId, dto.memberNumber, dto.programCode, requiredBranchId));

    const items = dto.items.map(item => ({
      ...item,
      quantity: item.quantity || 1,
      coveredByInsurance: item.coveredByInsurance !== false,
    }));

    const totalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);
    const claimedAmount = items.filter(i => i.coveredByInsurance).reduce((sum, i) => sum + i.totalAmount, 0);
    const patientAmount = totalAmount - claimedAmount;

    const claim = await this.claimModel.create({
      visitId: new Types.ObjectId(dto.visitId),
      patientId: new Types.ObjectId(dto.patientId),
      branchId: new Types.ObjectId(requiredBranchId),
      programCode: dto.programCode.toUpperCase(),
      subEntityCode: dto.subEntityCode,
      memberNumber: dto.memberNumber,
      memberName: dto.memberName,
      items,
      totalAmount,
      claimedAmount,
      patientAmount,
      status: ClaimStatusEnum.DRAFT,
      notes: dto.notes,
      createdBy: createdBy ? new Types.ObjectId(createdBy) : undefined,
    });

    this.logger.log(`Insurance claim created for visit ${visit.visitNumber}: ${claim._id}`);
    return claim;
  }

  async findAll(query: any = {}, branchId?: string): Promise<InsuranceClaim[]> {
    return this.claimModel
      .find(withBranch(query, branchId))
      .populate('visitId', 'visitNumber status createdAt')
      .populate('patientId', 'patientId firstName lastName')
      .sort({ createdAt: -1 })
      .lean();
  }

  async findById(id: string, branchId?: string): Promise<InsuranceClaim> {
    const claim = await this.claimModel
      .findOne(withBranch({ _id: id }, branchId))
      .populate('visitId')
      .populate('patientId')
      .populate('createdBy', 'fullName');
    if (!claim) throw new NotFoundException('Insurance claim not found');
    return claim;
  }

  async findByVisit(visitId: string, branchId?: string): Promise<InsuranceClaim[]> {
    return this.claimModel.find(withBranch({ visitId: new Types.ObjectId(visitId) }, branchId)).lean();
  }

  async findByPatient(patientId: string, branchId?: string): Promise<InsuranceClaim[]> {
    return this.claimModel
      .find(withBranch({ patientId: new Types.ObjectId(patientId) }, branchId))
      .populate('visitId', 'visitNumber createdAt')
      .sort({ createdAt: -1 })
      .lean();
  }

  async addItem(id: string, dto: AddClaimItemDto, branchId?: string): Promise<InsuranceClaim> {
    const claim = await this.claimModel.findOne(withBranch({ _id: id }, branchId));
    if (!claim) throw new NotFoundException('Insurance claim not found');
    if (claim.status !== ClaimStatusEnum.DRAFT) {
      throw new BadRequestException('Can only add items to draft claims');
    }

    const item = {
      ...dto,
      quantity: dto.quantity || 1,
      coveredByInsurance: dto.coveredByInsurance !== false,
    };

    claim.items.push(item as any);
    claim.totalAmount = claim.items.reduce((sum, i) => sum + i.totalAmount, 0);
    claim.claimedAmount = claim.items.filter(i => i.coveredByInsurance).reduce((sum, i) => sum + i.totalAmount, 0);
    claim.patientAmount = claim.totalAmount - claim.claimedAmount;

    return claim.save();
  }

  async removeItem(id: string, itemIndex: number, branchId?: string): Promise<InsuranceClaim> {
    const claim = await this.claimModel.findOne(withBranch({ _id: id }, branchId));
    if (!claim) throw new NotFoundException('Insurance claim not found');
    if (claim.status !== ClaimStatusEnum.DRAFT) {
      throw new BadRequestException('Can only remove items from draft claims');
    }
    if (itemIndex < 0 || itemIndex >= claim.items.length) {
      throw new BadRequestException('Invalid item index');
    }

    claim.items.splice(itemIndex, 1);
    claim.totalAmount = claim.items.reduce((sum, i) => sum + i.totalAmount, 0);
    claim.claimedAmount = claim.items.filter(i => i.coveredByInsurance).reduce((sum, i) => sum + i.totalAmount, 0);
    claim.patientAmount = claim.totalAmount - claim.claimedAmount;

    return claim.save();
  }

  async updateItemCoverage(id: string, itemIndex: number, coveredByInsurance: boolean, branchId?: string): Promise<InsuranceClaim> {
    const claim = await this.claimModel.findOne(withBranch({ _id: id }, branchId));
    if (!claim) throw new NotFoundException('Insurance claim not found');
    if (claim.status !== ClaimStatusEnum.DRAFT) {
      throw new BadRequestException('Can only update draft claims');
    }
    if (itemIndex < 0 || itemIndex >= claim.items.length) {
      throw new BadRequestException('Invalid item index');
    }

    (claim.items[itemIndex] as any).coveredByInsurance = coveredByInsurance;
    claim.claimedAmount = claim.items.filter(i => i.coveredByInsurance).reduce((sum, i) => sum + i.totalAmount, 0);
    claim.patientAmount = claim.totalAmount - claim.claimedAmount;

    return claim.save();
  }

  async updateStatus(id: string, dto: UpdateClaimStatusDto, branchId?: string, updatedBy?: string): Promise<InsuranceClaim> {
    const requiredBranchId = requireBranchId(branchId);
    const claim = await this.claimModel.findOne(withBranch({ _id: id }, requiredBranchId));
    if (!claim) throw new NotFoundException('Insurance claim not found');

    const validTransitions: Record<string, string[]> = {
      draft: ['submitted', 'rejected'],
      submitted: ['approved', 'partially_approved', 'rejected'],
      partially_approved: ['approved', 'rejected', 'paid'],
      approved: ['paid'],
      rejected: [],
      paid: [],
    };

    if (!validTransitions[claim.status]?.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from "${claim.status}" to "${dto.status}"`);
    }

    let effectiveStatus = dto.status as ClaimStatusEnum;
    if (dto.status === 'approved' || dto.status === 'partially_approved') {
      const requestedApproved = dto.approvedAmount ?? claim.claimedAmount;
      if (requestedApproved > claim.claimedAmount) {
        throw new BadRequestException('Approved amount cannot exceed the claimed amount');
      }
      effectiveStatus = requestedApproved < claim.claimedAmount
        ? ClaimStatusEnum.PARTIALLY_APPROVED
        : ClaimStatusEnum.APPROVED;
    }
    claim.status = effectiveStatus;
    claim.statusUpdatedAt = new Date();
    if (updatedBy && Types.ObjectId.isValid(updatedBy)) claim.statusUpdatedBy = new Types.ObjectId(updatedBy);
    if (dto.verificationReference) {
      claim.verificationReference = dto.verificationReference.trim();
      claim.verifiedAt = new Date();
      if (updatedBy && Types.ObjectId.isValid(updatedBy)) claim.verifiedBy = new Types.ObjectId(updatedBy);
    }

    if (effectiveStatus === ClaimStatusEnum.SUBMITTED) {
      claim.submittedAt = new Date();
    } else if (effectiveStatus === ClaimStatusEnum.APPROVED || effectiveStatus === ClaimStatusEnum.PARTIALLY_APPROVED) {
      claim.approvedAt = new Date();
      claim.approvedAmount = dto.approvedAmount ?? claim.claimedAmount;
      claim.patientAmount = Math.max(0, Math.round((claim.totalAmount - claim.approvedAmount) * 100) / 100);
      await this.reconcileClaimOrderCoverage(claim, claim.approvedAmount, requiredBranchId);
    } else if (effectiveStatus === ClaimStatusEnum.PAID) {
      claim.paidAt = new Date();
      claim.paidAmount = dto.paidAmount ?? dto.approvedAmount ?? claim.approvedAmount;
      await this.paymentModel.updateMany(
        withBranch({ insuranceClaimId: claim._id, isRefunded: { $ne: true } }, requiredBranchId),
        { $set: { isReceivable: false } },
      );
    } else if (effectiveStatus === ClaimStatusEnum.REJECTED) {
      claim.rejectionReason = dto.rejectionReason;
      claim.approvedAmount = 0;
      claim.patientAmount = claim.totalAmount;
      await this.reconcileClaimOrderCoverage(claim, 0, requiredBranchId);
    }

    if (dto.notes) {
      claim.notes = dto.notes;
    }

    return claim.save();
  }

  private async reconcileClaimOrderCoverage(claim: InsuranceClaimDocument, approvedAmount: number, branchId: string) {
    const coveredOrderItems = claim.items.filter(item =>
      item.coveredByInsurance &&
      (item.itemType === ClaimItemTypeEnum.LAB_ORDER || item.itemType === ClaimItemTypeEnum.PRESCRIPTION),
    );
    if (coveredOrderItems.length === 0) return;

    const claimedOrderAmount = coveredOrderItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const allocationTotal = Math.min(approvedAmount, claimedOrderAmount);
    let allocated = 0;
    for (let index = 0; index < coveredOrderItems.length; index += 1) {
      const item = coveredOrderItems[index];
      const isLast = index === coveredOrderItems.length - 1;
      const itemApproved = isLast
        ? Math.max(0, Math.round((allocationTotal - allocated) * 100) / 100)
        : Math.round((allocationTotal * (Number(item.totalAmount || 0) / claimedOrderAmount)) * 100) / 100;
      allocated += itemApproved;
      await this.ordersService.adjustInsurancePayment(item.itemId.toString(), claim._id.toString(), itemApproved, branchId);
    }
  }

  async getStats(branchId?: string): Promise<any> {
    const matchStage: any = {};
    if (branchId) matchStage.branchId = new Types.ObjectId(branchId);

    const [statusCounts, programCounts, totals] = await Promise.all([
      this.claimModel.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 }, claimed: { $sum: '$claimedAmount' }, paid: { $sum: '$paidAmount' } } },
      ]),
      this.claimModel.aggregate([
        { $match: matchStage },
        { $group: { _id: '$programCode', count: { $sum: 1 }, claimed: { $sum: '$claimedAmount' }, paid: { $sum: '$paidAmount' } } },
      ]),
      this.claimModel.aggregate([
        { $match: matchStage },
        { $group: { _id: null, totalClaims: { $sum: 1 }, totalClaimed: { $sum: '$claimedAmount' }, totalPaid: { $sum: '$paidAmount' }, totalPatient: { $sum: '$patientAmount' } } },
      ]),
    ]);

    return {
      byStatus: statusCounts,
      byProgram: programCounts,
      totals: totals[0] || { totalClaims: 0, totalClaimed: 0, totalPaid: 0, totalPatient: 0 },
    };
  }

  async markOrderAsInsuranceCovered(
    orderId: string,
    requestedInsuranceAmount?: number,
    createdBy?: string,
    branchId?: string,
    verificationReference?: string,
    verificationNotes?: string,
  ): Promise<{ claim: InsuranceClaim; order: any; patientBalance: number }> {
    const requiredBranchId = requireBranchId(branchId);
    const order = await this.orderModel.findOne(withBranch({ _id: orderId }, requiredBranchId)).populate('visitId');
    if (!order) throw new NotFoundException('Order not found');

    const visit = (order as any).visitId;
    if (!visit) throw new BadRequestException('Order has no linked visit');

    if (!visit.insurance?.programCode) {
      throw new BadRequestException('Patient does not have insurance on this visit');
    }

    this.assertNotBlocked(await this.findActiveInsuranceBlock(
      (order as any).patientId?._id || (order as any).patientId,
      visit.insurance.memberNumber,
      visit.insurance.programCode,
      requiredBranchId,
    ));

    const orderTotal = Number((order as any).total || 0);
    const currentPaid = Number((order as any).amountPaid || 0);
    const remainingBalance = Math.round((orderTotal - currentPaid) * 100) / 100;
    const amountToClaim = requestedInsuranceAmount === undefined
      ? remainingBalance
      : Math.round(requestedInsuranceAmount * 100) / 100;
    if (orderTotal <= 0) {
      throw new BadRequestException('Order has no amount to bill');
    }

    const existingClaim = await this.claimModel.findOne(withBranch({
      visitId: visit._id,
      'items.itemId': order._id,
    }, requiredBranchId));
    if (existingClaim) {
      return { claim: existingClaim, order, patientBalance: Number((order as any).balance || 0) };
    }

    if ((order as any).status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot mark a cancelled order as insurance-covered');
    }

    if ((order as any).paymentStatus === PaymentStatusEnum.PAID) {
      throw new BadRequestException('Order is already fully paid');
    }
    if (amountToClaim <= 0) {
      throw new BadRequestException('Order has no remaining balance to bill to insurance');
    }
    if (amountToClaim > remainingBalance + 0.001) {
      throw new BadRequestException(`Insurance amount (${amountToClaim}) exceeds remaining balance (${remainingBalance})`);
    }

    // Create a submitted claim. Coverage is operationally authorized, while
    // insurer approval/payment remains visible in the claim lifecycle.
    let claim = await this.claimModel.findOne(withBranch({
      visitId: visit._id,
      status: { $in: [ClaimStatusEnum.SUBMITTED, ClaimStatusEnum.APPROVED] },
    }, requiredBranchId));

    const description = (order as any).orderType === 'lab'
      ? `Lab order ${(order as any).orderNumber || ''}`
      : `Pharmacy order ${(order as any).orderNumber || ''}`;

    const item = {
      itemType: (order as any).orderType === 'lab' ? ClaimItemTypeEnum.LAB_ORDER : ClaimItemTypeEnum.PRESCRIPTION,
      itemId: order._id,
      description,
      quantity: 1,
      unitPrice: amountToClaim,
      totalAmount: amountToClaim,
      coveredByInsurance: true,
    };

    if (claim) {
      claim.items.push(item as any);
    } else {
      claim = await this.claimModel.create({
        visitId: visit._id,
        patientId: (order as any).patientId?._id || (order as any).patientId,
        branchId: visit.branchId,
        programCode: visit.insurance.programCode,
        subEntityCode: visit.insurance.subEntityCode,
        memberNumber: visit.insurance.memberNumber,
        memberName: visit.insurance.memberName,
        items: [item],
        status: ClaimStatusEnum.SUBMITTED,
        submittedAt: new Date(),
        verificationReference: verificationReference?.trim() || undefined,
        verifiedAt: new Date(),
        verifiedBy: createdBy ? new Types.ObjectId(createdBy) : undefined,
        notes: verificationNotes?.trim() || undefined,
        createdBy: createdBy ? new Types.ObjectId(createdBy) : undefined,
      });
    }

    if (verificationReference) claim.verificationReference = verificationReference.trim();
    if (verificationNotes) claim.notes = [claim.notes, verificationNotes.trim()].filter(Boolean).join('\n');
    claim.verifiedAt = new Date();
    if (createdBy && Types.ObjectId.isValid(createdBy)) claim.verifiedBy = new Types.ObjectId(createdBy);

    claim.totalAmount = claim.items.reduce((sum, i) => sum + i.totalAmount, 0);
    claim.claimedAmount = claim.items.filter(i => i.coveredByInsurance).reduce((sum, i) => sum + i.totalAmount, 0);
    claim.patientAmount = claim.totalAmount - claim.claimedAmount;
    await claim.save();

    const paymentResult = await this.ordersService.addPayment(orderId, {
      amount: amountToClaim,
      paymentMethod: 'insurance' as any,
      notes: `Insurance-covered: ${description} (claim ${claim._id})`,
    }, createdBy, requiredBranchId);
    paymentResult.payment.insuranceClaimId = claim._id as any;
    paymentResult.payment.isReceivable = true;
    await paymentResult.payment.save();

    this.logger.log(`Order ${orderId} marked as insurance-covered under claim ${claim._id}`);
    return {
      claim,
      order: paymentResult.order,
      patientBalance: Math.round((remainingBalance - amountToClaim) * 100) / 100,
    };
  }
}
