import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Order,
  OrderStatusEnum,
  OrderTypeEnum,
  PaymentStatusEnum,
} from '../database/schemas/order.schema';
import { LisIntegrationService } from '../lis-integration/lis-integration.service';

const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 25;

@Injectable()
export class LisResultsPollerService {
  private readonly logger = new Logger(LisResultsPollerService.name);
  private running = false;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly lisIntegrationService: LisIntegrationService,
  ) {}

  @Interval(Number(process.env.LIS_RESULTS_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS))
  async pollSavedLisResults() {
    if (process.env.LIS_RESULTS_AUTO_POLL === 'false') return;
    if (this.running) return;

    this.running = true;
    try {
      const limit = Number(process.env.LIS_RESULTS_POLL_LIMIT || DEFAULT_BATCH_LIMIT);
      const orders = await this.orderModel
        .find({
          orderType: OrderTypeEnum.LAB,
          paymentStatus: PaymentStatusEnum.PAID,
          lisSyncStatus: 'synced',
          lisExternalRequestId: { $exists: true, $ne: null },
          status: {
            $nin: [OrderStatusEnum.COMPLETED, OrderStatusEnum.CANCELLED],
          },
        })
        .sort({ lisResultsFetchedAt: 1, updatedAt: 1 })
        .limit(limit)
        .select('_id orderNumber branchId')
        .lean();

      if (orders.length === 0) return;

      let imported = 0;
      let failed = 0;

      for (const order of orders) {
        try {
          const result = await this.lisIntegrationService.fetchAndStoreResults(
            String(order._id),
            order.branchId?.toString(),
          );
          imported += Number(result?.imported || 0);
        } catch (error: any) {
          failed += 1;
          const message = error?.message || 'Unknown LIS result fetch error';
          await this.orderModel.findByIdAndUpdate(order._id, {
            lisSyncError: `Result fetch failed: ${message}`,
          });
          this.logger.warn(`LIS result fetch failed for ${order.orderNumber}: ${message}`);
        }
      }

      if (imported > 0 || failed > 0) {
        this.logger.log(
          `LIS result poll checked ${orders.length} order(s), imported ${imported} result(s), failed ${failed}`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
