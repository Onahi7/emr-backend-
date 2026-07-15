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
import { IntegrationJobsService } from '../integration-jobs/integration-jobs.service';
import { IntegrationJobType } from '../database/schemas/integration-job.schema';
import { requireBranchId } from '../common/utils/branch-scope';

const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 25;

@Injectable()
export class LisResultsPollerService {
  private readonly logger = new Logger(LisResultsPollerService.name);
  private running = false;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly integrationJobs: IntegrationJobsService,
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
        .select('_id orderNumber branchId lisResultsFetchedAt')
        .lean();

      if (orders.length === 0) return;

      let queued = 0;

      for (const order of orders) {
        const branchId = requireBranchId(order.branchId);
        const fetchVersion = order.lisResultsFetchedAt
          ? new Date(order.lisResultsFetchedAt).getTime()
          : 'initial';
        await this.integrationJobs.enqueue({
          branchId,
          type: IntegrationJobType.LIS_RESULT_IMPORT,
          aggregateId: String(order._id),
          idempotencyKey: `${IntegrationJobType.LIS_RESULT_IMPORT}:${String(order._id)}:${fetchVersion}`,
          payload: { orderId: String(order._id), branchId },
        });
        queued += 1;
      }

      this.logger.log(`Queued ${queued} background LIS result import job(s)`);
    } finally {
      this.running = false;
    }
  }
}
