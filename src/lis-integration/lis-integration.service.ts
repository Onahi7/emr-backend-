import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios, { AxiosInstance } from 'axios';
import { Model, Types } from 'mongoose';
import {
  Order,
  OrderStatusEnum,
  OrderTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '../database/schemas/order.schema';
import { Result, ResultStatusEnum } from '../database/schemas/result.schema';

@Injectable()
export class LisIntegrationService {
  private readonly logger = new Logger(LisIntegrationService.name);
  private readonly client?: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Result.name) private resultModel: Model<Result>,
  ) {
    const baseURL = this.configService.get<string>('lis.baseUrl');
    const apiKey = this.configService.get<string>('lis.apiKey');

    if (baseURL && apiKey) {
      this.client = axios.create({
        baseURL: baseURL.replace(/\/$/, ''),
        timeout: this.configService.get<number>('lis.timeoutMs') || 15000,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      });
    }
  }

  isEnabled(): boolean {
    return !!this.client;
  }

  async syncOrderToLis(orderId: string): Promise<void> {
    if (!this.client) return;

    const order = await this.loadOrder(orderId);
    if (!order || order.orderType !== OrderTypeEnum.LAB) return;

    const externalRequestId = order.lisExternalRequestId || `EMR-${order.orderNumber}`;

    try {
      const response = await this.client.post('/external-api/test-requests', {
        externalRequestId,
        patient: this.mapPatient(order.patientId),
        tests: (order.order_tests || []).map((test: any) => ({
          code: test.testCode || test.test_code,
        })),
        priority: order.priority,
        referredByDoctor: order.doctorId?.fullName,
        notes: [
          order.notes,
          `EMR order ${order.orderNumber}`,
          order.visitId ? `Visit ${order.visitId}` : undefined,
        ].filter(Boolean).join(' | '),
      });

      await this.orderModel.findByIdAndUpdate(order._id, {
        lisExternalRequestId: externalRequestId,
        lisOrderId: response.data?.orderId,
        lisOrderNumber: response.data?.orderNumber,
        lisSyncStatus: 'synced',
        lisSyncError: undefined,
        lisSyncedAt: new Date(),
      });
    } catch (error: any) {
      const message = this.getErrorMessage(error);
      await this.orderModel.findByIdAndUpdate(order._id, {
        lisExternalRequestId: externalRequestId,
        lisSyncStatus: 'failed',
        lisSyncError: message,
      });
      this.logger.warn(`LIS order sync failed for ${order.orderNumber}: ${message}`);
    }
  }

  async syncPaymentToLis(orderId: string, amount: number, paymentMethod: string): Promise<void> {
    if (!this.client) return;

    const order = await this.loadOrder(orderId);
    if (!order || order.orderType !== OrderTypeEnum.LAB) return;

    if (order.lisSyncStatus !== 'synced') {
      await this.syncOrderToLis(orderId);
    }

    const refreshed = await this.orderModel.findById(orderId).lean();
    const externalRequestId = refreshed?.lisExternalRequestId || `EMR-${order.orderNumber}`;
    if (refreshed?.lisSyncStatus !== 'synced') return;

    try {
      await this.client.post(`/external-api/test-requests/${encodeURIComponent(externalRequestId)}/payment`, {
        amount,
        paymentMethod: this.mapPaymentMethod(paymentMethod),
        notes: `Paid in EMR for ${order.orderNumber}${paymentMethod === PaymentMethodEnum.WALLET ? ' via wallet' : ''}`,
      });
    } catch (error: any) {
      const message = this.getErrorMessage(error);
      await this.orderModel.findByIdAndUpdate(orderId, {
        lisSyncStatus: 'failed',
        lisSyncError: `Payment sync failed: ${message}`,
      });
      this.logger.warn(`LIS payment sync failed for ${order.orderNumber}: ${message}`);
    }
  }

  async fetchAndStoreResults(orderId: string): Promise<any> {
    if (!this.client) {
      throw new Error('LIS integration is not configured');
    }

    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new Error('Order not found');
    if (!order.lisExternalRequestId) {
      throw new Error('Order has not been synced to LIS');
    }

    const response = await this.client.get(
      `/external-api/test-requests/${encodeURIComponent(order.lisExternalRequestId)}/results`,
    );
    const results = response.data?.results || [];

    for (const result of results) {
      if (!result.testCode || result.value === undefined || result.value === null) {
        continue;
      }

      await this.resultModel.updateOne(
        {
          orderId: new Types.ObjectId(orderId),
          testCode: result.testCode,
        },
        {
          $set: {
            orderId: new Types.ObjectId(orderId),
            testCode: result.testCode,
            testName: result.testName || result.testCode,
            panelCode: result.panelCode,
            panelName: result.panelName,
            subcategory: result.subcategory,
            value: String(result.value),
            unit: result.unit,
            referenceRange: result.referenceRange,
            flag: result.flag || 'normal',
            status: result.status || ResultStatusEnum.VERIFIED,
            resultedAt: result.resultedAt ? new Date(result.resultedAt) : new Date(),
            verifiedAt: result.verifiedAt ? new Date(result.verifiedAt) : undefined,
            comments: 'Imported from LIS',
          },
        },
        { upsert: true },
      );
    }

    await this.orderModel.findByIdAndUpdate(orderId, {
      status: response.data?.isComplete ? OrderStatusEnum.COMPLETED : order.status,
      lisResultsFetchedAt: new Date(),
      lisSyncStatus: 'synced',
      lisSyncError: undefined,
    });

    return {
      imported: results.length,
      orderNumber: response.data?.orderNumber,
      status: response.data?.status,
      results,
    };
  }

  private async loadOrder(orderId: string): Promise<any> {
    return this.orderModel
      .findById(orderId)
      .populate('patientId', 'patientId firstName lastName age ageValue ageUnit gender phone address mrn')
      .populate('doctorId', 'fullName')
      .lean()
      .then(async (order: any) => {
        if (!order) return null;
        const orderTests = await this.orderModel.db
          .model('OrderTest')
          .find({ orderId: order._id })
          .lean();
        return { ...order, order_tests: orderTests };
      });
  }

  private mapPatient(patient: any) {
    return {
      firstName: patient?.firstName,
      lastName: patient?.lastName,
      age: patient?.age,
      ageValue: patient?.ageValue,
      ageUnit: patient?.ageUnit,
      gender: patient?.gender,
      phone: patient?.phone || 'N/A',
      address: patient?.address,
      mrn: patient?.mrn || patient?.patientId,
    };
  }

  private mapPaymentMethod(paymentMethod: string) {
    if (paymentMethod === PaymentMethodEnum.ORANGE_MONEY) return 'orange_money';
    if (paymentMethod === PaymentMethodEnum.AFRIMONEY) return 'afrimoney';
    return 'cash';
  }

  private getErrorMessage(error: any): string {
    return (
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Unknown LIS integration error'
    );
  }
}
