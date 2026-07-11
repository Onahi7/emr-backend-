import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { LisIntegrationService } from '../src/lis-integration/lis-integration.service';

const BRANCHES: Record<string, string> = {
  AllenTown: '6a18cecb719ac95c1ebade70',
  CongoCross: '6a18cecb719ac95c1ebade71',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const branchArg = process.argv.find((a) => a.startsWith('--branch='));
  const targetBranches = branchArg
    ? { [branchArg.split('=')[1]]: BRANCHES[branchArg.split('=')[1]] }
    : BRANCHES;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const lisIntegration = app.get(LisIntegrationService);

    let totalSynced = 0;
    let totalFailed = 0;

    for (const [branchName, branchId] of Object.entries(targetBranches)) {
      if (!branchId) {
        console.log(`Unknown branch: ${branchName}`);
        continue;
      }

      const oid = new Types.ObjectId(branchId);
      const branchFilter = { $or: [{ branchId: oid }, { branchId }] };

      const orders = await connection.collection('orders').find({
        ...branchFilter,
        orderType: 'lab',
        status: { $ne: 'cancelled' },
        $or: [
          { lisSyncStatus: { $ne: 'synced' } },
          {
            paymentStatus: 'paid',
            $or: [
              { lisPaymentSyncStatus: { $ne: 'synced' } },
              { lisPaymentSyncStatus: { $exists: false } },
            ],
          },
        ],
      }).sort({ createdAt: 1 }).toArray();

      console.log(`\n=== ${branchName} (${branchId}) — ${orders.length} orders needing sync ===`);

      for (const order of orders) {
        const paymentMethod = order.paymentMethod || 'cash';
        const amount = Number(order.amountPaid || order.total || 0);
        console.log([
          order.orderNumber,
          order._id.toString(),
          `status=${order.status}`,
          `pay=${order.paymentStatus}`,
          `lis=${order.lisSyncStatus || 'unset'}`,
          `payLis=${order.lisPaymentSyncStatus || 'unset'}`,
          `total=${order.total}`,
        ].join(' | '));

        if (dryRun) {
          console.log('  (dry run — skipping)');
          continue;
        }

        try {
          if (order.paymentStatus === 'paid') {
            if (order.lisSyncStatus !== 'synced') {
              await lisIntegration.syncOrderToLis(order._id.toString(), branchId);
            }
            if (order.lisPaymentSyncStatus !== 'synced') {
              await lisIntegration.syncPaymentToLis(order._id.toString(), amount, paymentMethod, branchId);
            }
          } else {
            await lisIntegration.syncOrderToLis(order._id.toString(), branchId);
          }

          const refreshed = await connection.collection('orders').findOne({ _id: order._id });
          const lisStatus = refreshed?.lisSyncStatus || 'unset';
          const payLisStatus = refreshed?.lisPaymentSyncStatus || 'unset';
          const error = refreshed?.lisSyncError || refreshed?.lisPaymentSyncError || '-';

          if (lisStatus === 'synced' || (order.paymentStatus !== 'paid' && lisStatus === 'synced')) {
            totalSynced++;
          } else {
            totalFailed++;
          }
          console.log(`  -> lis=${lisStatus} payLis=${payLisStatus} error=${error}`);
        } catch (err) {
          totalFailed++;
          console.log(`  -> ERROR: ${err.message}`);
        }
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Synced: ${totalSynced}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Dry run: ${dryRun}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
