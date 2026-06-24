import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { Order, PaymentStatusEnum, OrderStatusEnum, OrderTypeEnum } from '../database/schemas/order.schema';
import { Consultation } from '../database/schemas/consultation.schema';
import { Prescription } from '../database/schemas/prescription.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Consultation.name) private consultationModel: Model<Consultation>,
    @InjectModel(Prescription.name) private prescriptionModel: Model<Prescription>,
  ) {}

  async createPayment(data: {
    paymentType: PaymentTypeEnum;
    amount: number;
    paymentMethod: string;
    visitId?: string;
    orderId?: string;
    consultationId?: string;
    prescriptionId?: string;
    receivedBy: string;
    notes?: string;
    branchId?: string;
  }): Promise<Payment> {
    const { paymentType, amount, paymentMethod, visitId, orderId, consultationId, prescriptionId, receivedBy, notes, branchId } = data;

    // Verify the referenced entity exists and update payment status
    if ((paymentType === PaymentTypeEnum.LAB_ORDER || paymentType === PaymentTypeEnum.PHARMACY_ORDER) && orderId) {
      const order = await this.orderModel.findById(orderId);
      if (!order) throw new NotFoundException('Order not found');

      // Accumulate payment correctly — do not overwrite amountPaid
      order.amountPaid = Math.round(((order.amountPaid || 0) + amount) * 100) / 100;
      order.balance = Math.round((order.total - order.amountPaid) * 100) / 100;

      if (order.amountPaid >= order.total) {
        order.paymentStatus = PaymentStatusEnum.PAID;
        order.balance = 0;
      } else if (order.amountPaid > 0) {
        order.paymentStatus = PaymentStatusEnum.PARTIAL;
      }

      if (order.paymentStatus === PaymentStatusEnum.PAID && order.status === OrderStatusEnum.AWAITING_PAYMENT) {
        order.status = order.orderType === OrderTypeEnum.LAB
          ? OrderStatusEnum.PENDING_COLLECTION
          : OrderStatusEnum.PAID;
      }

      await order.save();
    }

    if (paymentType === PaymentTypeEnum.CONSULTATION && consultationId) {
      const consultation = await this.consultationModel.findById(consultationId);
      if (!consultation) throw new NotFoundException('Consultation not found');
      consultation.isPaid = true;
      await consultation.save();
    }

    if (paymentType === PaymentTypeEnum.PRESCRIPTION && prescriptionId) {
      const prescription = await this.prescriptionModel.findById(prescriptionId);
      if (!prescription) throw new NotFoundException('Prescription not found');
      prescription.isPaid = true;
      await prescription.save();
    }

    const payment = new this.paymentModel({
      paymentType,
      amount,
      paymentMethod,
      visitId: visitId ? new Types.ObjectId(visitId) : undefined,
      orderId: orderId ? new Types.ObjectId(orderId) : undefined,
      consultationId: consultationId ? new Types.ObjectId(consultationId) : undefined,
      prescriptionId: prescriptionId ? new Types.ObjectId(prescriptionId) : undefined,
      receivedBy: new Types.ObjectId(receivedBy),
      notes,
      isRefunded: false,
      branchId,
    });

    return payment.save();
  }

  async findAll(branchId?: string): Promise<Payment[]> {
    const filter: any = {};
    if (branchId) filter.branchId = branchId;
    return this.paymentModel
      .find(filter)
      .populate('receivedBy', 'fullName')
      .populate('visitId', 'patientId')
      .populate({ path: 'visitId', populate: { path: 'patientId', select: 'firstName lastName' } })
      .populate('orderId', 'orderNumber total amountPaid paymentStatus orderType')
      .populate({
        path: 'prescriptionId',
        select: 'prescriptionNumber patientId items totalAmount isPaid createdAt',
        populate: { path: 'patientId', select: 'patientId firstName lastName' },
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
  }

  async findByVisit(visitId: string, branchId?: string): Promise<Payment[]> {
    const filter: any = { visitId: new Types.ObjectId(visitId) };
    if (branchId) filter.branchId = branchId;
    return this.paymentModel
      .find(filter)
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByOrder(orderId: string, branchId?: string): Promise<Payment[]> {
    const filter: any = { orderId: new Types.ObjectId(orderId) };
    if (branchId) filter.branchId = branchId;
    return this.paymentModel
      .find(filter)
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByConsultation(consultationId: string, branchId?: string): Promise<Payment[]> {
    const filter: any = { consultationId: new Types.ObjectId(consultationId) };
    if (branchId) filter.branchId = branchId;
    return this.paymentModel
      .find(filter)
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByPrescription(prescriptionId: string, branchId?: string): Promise<Payment[]> {
    const filter: any = { prescriptionId: new Types.ObjectId(prescriptionId) };
    if (branchId) filter.branchId = branchId;
    return this.paymentModel
      .find(filter)
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByPatient(patientId: string, branchId?: string): Promise<Payment[]> {
    const filter: any = { patientId: new Types.ObjectId(patientId) };
    if (branchId) filter.branchId = branchId;
    return this.paymentModel
      .find(filter)
      .populate('receivedBy', 'fullName')
      .populate('orderId', 'orderNumber total paymentStatus')
      .populate('treatmentPlanId', 'planNumber totalAmount paymentStatus')
      .sort({ createdAt: -1 })
      .exec();
  }

  async refund(paymentId: string, reason: string): Promise<Payment> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.isRefunded) throw new BadRequestException('Payment already refunded');

    payment.isRefunded = true;
    payment.refundReason = reason;
    return payment.save();
  }
}
