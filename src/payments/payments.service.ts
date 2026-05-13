import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentTypeEnum } from '../database/schemas/payment.schema';
import { Order, PaymentStatusEnum } from '../database/schemas/order.schema';
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
  }): Promise<Payment> {
    const { paymentType, amount, paymentMethod, visitId, orderId, consultationId, prescriptionId, receivedBy, notes } = data;

    // Verify the referenced entity exists and update payment status
    if ((paymentType === PaymentTypeEnum.LAB_ORDER || paymentType === PaymentTypeEnum.PHARMACY_ORDER) && orderId) {
      const order = await this.orderModel.findById(orderId);
      if (!order) throw new NotFoundException('Order not found');
      order.paymentStatus = PaymentStatusEnum.PAID;
      order.amountPaid = (order.amountPaid || 0) + amount;
      order.balance = order.total - order.amountPaid;
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
    });

    return payment.save();
  }

  async findByVisit(visitId: string): Promise<Payment[]> {
    return this.paymentModel
      .find({ visitId: new Types.ObjectId(visitId) })
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByOrder(orderId: string): Promise<Payment[]> {
    return this.paymentModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByConsultation(consultationId: string): Promise<Payment[]> {
    return this.paymentModel
      .find({ consultationId: new Types.ObjectId(consultationId) })
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByPrescription(prescriptionId: string): Promise<Payment[]> {
    return this.paymentModel
      .find({ prescriptionId: new Types.ObjectId(prescriptionId) })
      .populate('receivedBy', 'fullName')
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
