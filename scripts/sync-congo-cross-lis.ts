import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { LisIntegrationService } from '../src/lis-integration/lis-integration.service';

const CONGO_CROSS_BRANCH_ID = '6a18cecb719ac95c1ebade71';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const lisIntegration = app.get(LisIntegrationService);
    const branchId = new Types.ObjectId(CONGO_CROSS_BRANCH_ID);

    const branchFilter = { $or: [{ branchId }, { branchId: CONGO_CROSS_BRANCH_ID }] };
    const explicitOrderIds = process.argv
      .filter((arg) => /^[a-f\d]{24}$/i.test(arg))
      .map((id) => new Types.ObjectId(id));

    const orders = await connection.collection('orders').find({
      ...(explicitOrderIds.length > 0 ? { _id: { $in: explicitOrderIds } } : branchFilter),
      orderType: 'lab',
      status: { $ne: 'cancelled' },
      $or: [
        { lisSyncStatus: { $ne: 'synced' } },
        {
          paymentStatus: 'paid',
          lisPaymentSyncStatus: { $ne: 'synced' },
        },
      ],
    }).sort({ createdAt: 1 }).toArray();

    console.log(`Congo Cross lab orders needing LIS sync: ${orders.length}`);
    for (const order of orders) {
      const paymentMethod = order.paymentMethod || 'cash';
      const amount = Number(order.amountPaid || order.total || 0);
      console.log([
        order.orderNumber,
        order._id.toString(),
        `status=${order.status}`,
        `payment=${order.paymentStatus}`,
        `lis=${order.lisSyncStatus || 'unset'}`,
        `payLis=${order.lisPaymentSyncStatus || 'unset'}`,
      ].join(' | '));

      if (dryRun) continue;

      if (order.paymentStatus === 'paid') {
        await lisIntegration.syncPaymentToLis(order._id.toString(), amount, paymentMethod, CONGO_CROSS_BRANCH_ID);
      } else {
        await lisIntegration.syncOrderToLis(order._id.toString(), CONGO_CROSS_BRANCH_ID);
      }

      const refreshed = await connection.collection('orders').findOne({ _id: order._id });
      console.log(`  -> lis=${refreshed?.lisSyncStatus || 'unset'} payLis=${refreshed?.lisPaymentSyncStatus || 'unset'} error=${refreshed?.lisSyncError || refreshed?.lisPaymentSyncError || '-'}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
