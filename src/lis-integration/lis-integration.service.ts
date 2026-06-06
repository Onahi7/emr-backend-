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
import { Result, ResultFlagEnum, ResultStatusEnum } from '../database/schemas/result.schema';
import { TestCatalog } from '../database/schemas/test-catalog.schema';
import { Branch, BranchDocument } from '../branches/branch.schema';
import { Visit, VisitStatusEnum } from '../database/schemas/visit.schema';

@Injectable()
export class LisIntegrationService {
  private readonly logger = new Logger(LisIntegrationService.name);
  private readonly client?: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Result.name) private resultModel: Model<Result>,
    @InjectModel(TestCatalog.name) private testCatalogModel: Model<TestCatalog>,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
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

  private async getBranchLisConfig(branchId?: string): Promise<{
    apiKey: string;
    baseUrl: string;
    facilityName: string;
    facilityLocation: string;
    sourceSystem: string;
    branchCode?: string;
    branchId?: string;
  }> {
    const defaultConfig = {
      apiKey: this.configService.get<string>('lis.apiKey') || '',
      baseUrl: this.configService.get<string>('lis.baseUrl') || '',
      facilityName: this.configService.get<string>('lis.sourceFacilityName') || 'Harbour EMR',
      facilityLocation: this.configService.get<string>('lis.sourceFacilityLocation') || 'EMR',
      sourceSystem: this.configService.get<string>('lis.sourceSystem') || 'Harbour EMR',
      branchCode: undefined,
      branchId,
    };

    if (!branchId) return defaultConfig;

    try {
      const branch = await this.branchModel.findById(branchId).lean().exec();
      if (branch && branch.labApiKey) {
        return {
          apiKey: branch.labApiKey,
          baseUrl: defaultConfig.baseUrl,
          facilityName: branch.name || defaultConfig.facilityName,
          facilityLocation: branch.address || defaultConfig.facilityLocation,
          sourceSystem: `${branch.name} EMR`,
          branchCode: branch.code,
          branchId: branch._id?.toString(),
        };
      }
    } catch (err: any) {
      this.logger.warn(`Failed to get branch LIS config: ${err.message}`);
    }

    return defaultConfig;
  }

  private async createLisClient(branchId?: string): Promise<AxiosInstance | null> {
    const config = await this.getBranchLisConfig(branchId);
    if (!config.apiKey || !config.baseUrl) return null;

    return axios.create({
      baseURL: config.baseUrl,
      timeout: 15000,
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async fetchLisOrderables(branchId?: string): Promise<Array<{
    code: string;
    name: string;
    price?: number;
    isPanel?: boolean;
    category?: string;
    panelComponents?: Array<{ testCode: string; testName: string }>;
  }>> {
    const client = await this.createLisClient(branchId) || this.client;
    if (!client) return [];

    // Try known partner endpoints in order. We normalize shape for EMR UI.
    const candidates = [
      '/external-api/catalog',
      '/external-api/tests',
      '/external-api/orderables',
    ];

    for (const path of candidates) {
      try {
        const response = await client.get(path);
        const payload = response.data;
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.items)
              ? payload.items
              : [
                  ...(Array.isArray(payload?.tests) ? payload.tests : []),
                  ...(Array.isArray(payload?.panels) ? payload.panels : []),
                ];

        if (!Array.isArray(list) || list.length === 0) continue;

        const normalized = list
          .map((item: any) => {
            const components = Array.isArray(item.panelComponents)
              ? item.panelComponents
              : Array.isArray(item.tests)
                ? item.tests
                : [];

            return {
              code: (item.code || item.testCode || item.panelCode || '').toString().trim().toUpperCase(),
              name: (item.name || item.testName || item.panelName || item.description || '').toString().trim(),
              price: Number(item.price ?? item.amount ?? 0) || 0,
              isPanel: Boolean(
                item.isPanel ||
                item.type === 'panel' ||
                item.kind === 'panel' ||
                components.length > 0
              ),
              category: item.category || item.department || 'lab',
              panelComponents: components.map((component: any) => ({
                testCode: (component.testCode || component.code || '').toString().trim().toUpperCase(),
                testName: (component.testName || component.name || component.testCode || component.code || '').toString().trim(),
              })).filter((component: any) => component.testCode || component.testName),
            };
          })
          .filter((x) => x.code && x.name);

        if (normalized.length > 0) return normalized;
      } catch (error: any) {
        this.logger.debug(`LIS catalog endpoint failed (${path}): ${this.getErrorMessage(error)}`);
      }
    }

    return [];
  }

  async syncOrderToLis(orderId: string, branchId?: string): Promise<void> {
    const order = await this.loadOrder(orderId);
    if (!order || order.orderType !== OrderTypeEnum.LAB) return;

    const effectiveBranchId = branchId || order.branchId?.toString();
    const client = await this.createLisClient(effectiveBranchId) || this.client;
    if (!client) return;

    const externalRequestId = order.lisExternalRequestId || `EMR-${order.orderNumber}`;
    const branchConfig = await this.getBranchLisConfig(effectiveBranchId);

    try {
      const testsToSend = this.buildLisTests(order.lisRequestedCodes || [], order.order_tests || []);

      const response = await client.post('/external-api/test-requests', {
        externalRequestId,
        sourceSystem: branchConfig.sourceSystem,
        sourceBranchId: branchConfig.branchId || effectiveBranchId,
        sourceBranchCode: branchConfig.branchCode,
        sourceFacilityName: branchConfig.facilityName,
        sourceFacilityLocation: branchConfig.facilityLocation,
        patient: this.mapPatient(order.patientId),
        tests: testsToSend,
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

  /**
   * Build LIS test payload:
   * - If order tests are panel components (have panelCode), send the parent panel code once.
   * - Include standalone tests that have no panelCode.
   * This avoids sending analyzer component codes that partner LIS may not accept as orderable tests.
   */
  private buildLisTests(requestedCodes: string[], orderTests: any[]): Array<{ code: string }> {
    // Primary source of truth: explicit requested LIS codes captured at order creation.
    const explicit = Array.from(
      new Set(
        (requestedCodes || [])
          .map((code) => (code || '').toString().trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    if (explicit.length > 0) {
      return explicit.map((code) => ({ code }));
    }

    // Fallback for legacy orders created before lisRequestedCodes existed.
    const codes = new Set<string>();

    for (const test of orderTests) {
      const panelCode = (test.panelCode || test.panel_code || '').toString().trim().toUpperCase();
      const testCode = (test.testCode || test.test_code || '').toString().trim().toUpperCase();

      if (panelCode) {
        codes.add(panelCode);
        continue;
      }

      if (testCode) {
        codes.add(testCode);
      }
    }

    return Array.from(codes).map((code) => ({ code }));
  }

  async syncPaymentToLis(orderId: string, amount: number, paymentMethod: string, branchId?: string): Promise<void> {
    const order = await this.loadOrder(orderId);
    if (!order || order.orderType !== OrderTypeEnum.LAB) return;

    const effectiveBranchId = branchId || order.branchId?.toString();
    const client = await this.createLisClient(effectiveBranchId) || this.client;
    if (!client) return;

    if (order.lisSyncStatus !== 'synced') {
      await this.syncOrderToLis(orderId, effectiveBranchId);
    }

    const refreshed = await this.orderModel.findById(orderId).lean();
    const externalRequestId = refreshed?.lisExternalRequestId || `EMR-${order.orderNumber}`;
    if (refreshed?.lisSyncStatus !== 'synced') return;

    try {
      const syncPaymentAmounts = this.configService.get<boolean>('lis.syncPaymentAmounts') === true;
      const lisAmount = syncPaymentAmounts ? amount : 0;
      await client.post(`/external-api/test-requests/${encodeURIComponent(externalRequestId)}/payment`, {
        amount: lisAmount,
        paymentMethod: this.mapPaymentMethod(paymentMethod),
        notes: syncPaymentAmounts
          ? `Paid in EMR for ${order.orderNumber}${paymentMethod === PaymentMethodEnum.WALLET ? ' via wallet' : ''}`
          : `Payment collected in EMR for ${order.orderNumber}; financial amount retained in EMR`,
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

  async fetchAndStoreResults(orderId: string, branchId?: string): Promise<any> {
    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new Error('Order not found');
    if (!order.lisExternalRequestId) {
      throw new Error('Order has not been synced to LIS');
    }

    const effectiveBranchId = branchId || order.branchId?.toString();
    const client = await this.createLisClient(effectiveBranchId) || this.client;
    if (!client) {
      throw new Error('LIS integration is not configured');
    }

    const response = await client.get(
      `/external-api/test-requests/${encodeURIComponent(order.lisExternalRequestId)}/results`,
    );
    const results = response.data?.results || [];
    const orderObjectId = new Types.ObjectId(orderId);
    const orderTests = await this.orderModel.db
      .model('OrderTest')
      .find({ orderId: orderObjectId })
      .select('_id testCode')
      .lean();
    const orderTestByCode = new Map(
      orderTests.map((test: any) => [
        this.normalizeTestCode(test.testCode),
        test._id,
      ]),
    );

    for (const result of results) {
      if (!result.testCode || result.value === undefined || result.value === null) {
        continue;
      }

      const normalizedTestCode = this.normalizeTestCode(result.testCode);
      const orderTestId = orderTestByCode.get(normalizedTestCode);
      const catalogTest = await this.findCatalogTest(normalizedTestCode, result.testCode);
      const referenceRange =
        result.referenceRange ||
        catalogTest?.referenceRange ||
        this.pickCatalogReferenceRange(catalogTest);
      const calculatedFlag = this.calculateFlag(String(result.value), referenceRange);
      const flag = this.pickResultFlag(result.flag, calculatedFlag);

      await this.resultModel.updateOne(
        {
          orderId: orderObjectId,
          testCode: normalizedTestCode,
        },
        {
          $set: {
            orderId: orderObjectId,
            orderTestId,
            testCode: normalizedTestCode,
            testName: result.testName || catalogTest?.name || normalizedTestCode,
            panelCode: result.panelCode,
            panelName: result.panelName,
            subcategory: result.subcategory || catalogTest?.subcategory,
            value: String(result.value),
            unit: result.unit || catalogTest?.unit,
            referenceRange,
            flag,
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

    // Sync visit status so doctor sees results_ready
    if (order.visitId) {
      const visit = await this.visitModel.findById(order.visitId);
      if (visit && ![VisitStatusEnum.COMPLETED, VisitStatusEnum.CANCELLED].includes(visit.status)) {
        const allOrders = await this.orderModel.find({ visitId: order.visitId }).lean();
        const allCompleted = allOrders.every((o: any) => o.status === OrderStatusEnum.COMPLETED || o.status === OrderStatusEnum.CANCELLED);
        if (allCompleted || response.data?.isComplete) {
          visit.status = VisitStatusEnum.RESULTS_READY;
          await visit.save();
          this.logger.log(`Visit ${visit.visitNumber} status updated to RESULTS_READY after LIS results fetch`);
        }
      }
    }

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
      .populate('orderedBy', 'fullName email')
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

  private normalizeTestCode(code?: string): string {
    const compact = (code || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (['HBA1C', 'HBAIC', 'A1C', 'HBA', 'GLYCATEDHB', 'GLYCATEDHEMOGLOBIN'].includes(compact)) {
      return 'HBA1C';
    }

    if (['CKMB', 'CKMBMASS', 'CREATINEKINASEMB'].includes(compact)) {
      return 'CKMB';
    }

    return compact;
  }

  private async findCatalogTest(normalizedCode: string, originalCode?: string): Promise<any> {
    const original = this.normalizeTestCode(originalCode);
    const rawOriginal = (originalCode || '').toString().trim().toUpperCase();
    const codeCandidates = Array.from(new Set([normalizedCode, original, rawOriginal].filter(Boolean)));

    return this.testCatalogModel
      .findOne({ code: { $in: codeCandidates } })
      .select('code name unit referenceRange referenceRanges subcategory')
      .lean();
  }

  private pickCatalogReferenceRange(catalogTest?: any): string | undefined {
    if (!catalogTest?.referenceRanges?.length) {
      return undefined;
    }

    const normalRange = catalogTest.referenceRanges.find((range: any) =>
      ['normal', 'adult', 'all'].includes((range.ageGroup || range.condition || range.gender || '').toString().toLowerCase()),
    );

    return (normalRange || catalogTest.referenceRanges[0])?.range;
  }

  private pickResultFlag(incomingFlag: string | undefined, calculatedFlag: ResultFlagEnum): ResultFlagEnum {
    const normalizedIncoming = (incomingFlag || '').toString().trim().toLowerCase();
    const validFlags = new Set(Object.values(ResultFlagEnum));

    if (validFlags.has(normalizedIncoming as ResultFlagEnum) && normalizedIncoming !== ResultFlagEnum.NORMAL) {
      return normalizedIncoming as ResultFlagEnum;
    }

    return calculatedFlag;
  }

  private calculateFlag(value: string, referenceRange?: string): ResultFlagEnum {
    if (!referenceRange) {
      return ResultFlagEnum.NORMAL;
    }

    const normalizedValue = String(value || '').trim().replace('≤', '<=').replace('≥', '>=');
    const numericValueMatch = normalizedValue.match(/^(?:[<>]=?)?\s*(-?\d*\.?\d+)/);
    if (!numericValueMatch) {
      return ResultFlagEnum.NORMAL;
    }

    const numericValue = parseFloat(numericValueMatch[1]);
    const normalizedRange = String(referenceRange)
      .trim()
      .replace('≤', '<=')
      .replace('≥', '>=')
      .replace(/â‰¤/g, '<=')
      .replace(/â‰¥/g, '>=')
      .replace(/[–—]/g, '-');

    const rangeMatch = normalizedRange.match(/(-?\d*\.?\d+)\s*-\s*(-?\d*\.?\d+)/);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1]);
      const high = parseFloat(rangeMatch[2]);

      if (numericValue < low) return ResultFlagEnum.LOW;
      if (numericValue > high) return ResultFlagEnum.HIGH;
      return ResultFlagEnum.NORMAL;
    }

    const thresholdMatch = normalizedRange.match(/^(<=|>=|<|>)\s*(-?\d*\.?\d+)/);
    if (thresholdMatch) {
      const operator = thresholdMatch[1];
      const threshold = parseFloat(thresholdMatch[2]);

      if (operator === '<' || operator === '<=') {
        return numericValue >= threshold ? ResultFlagEnum.HIGH : ResultFlagEnum.NORMAL;
      }

      return numericValue <= threshold ? ResultFlagEnum.LOW : ResultFlagEnum.NORMAL;
    }

    return ResultFlagEnum.NORMAL;
  }

  private getErrorMessage(error: any): string {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Unknown LIS integration error';

    return Array.isArray(message) ? message.join('; ') : String(message);
  }
}
