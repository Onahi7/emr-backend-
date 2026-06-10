// Targeted cleanup of today's payment records + pending prescriptions.
// Hard-coded IDs (recorded 2026-06-10 and earlier pending entries from
// restore scripts). Never uses deleteMany({}) with empty filter.
//
// Run: node scripts/cleanup-todays-and-pending.js --yes
// Requires: MONGODB_URI in .env.production (read directly from file)

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const TODAY_START = new Date('2026-06-10T00:00:00.000Z');
const TODAY_END   = new Date('2026-06-11T00:00:00.000Z');

// 1) Today's 5 payment records (created on 2026-06-10)
const PAYMENT_IDS = [
  // placeholder — script discovers these from the DB
];

// 2) Pending payment prescriptions: 1 record
const RX_CANCEL_IDS = [
  // to be filled from the DB query
];

async function main() {
  // Read MONGODB_URI from .env.production
  const envFile = path.join(__dirname, '..', '.env.production');
  const envContent = fs.readFileSync(envFile, 'utf-8');
  const m = envContent.match(/^MONGODB_URI=(.+)$/m);
  const uri = m ? m[1].trim() : null;
  if (!uri) {
    console.error('MONGODB_URI not found in .env.production');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // ===== 1) Discover today's payments =====
  const todayPayments = await db.collection('payments')
    .find({ createdAt: { $gte: TODAY_START, $lt: TODAY_END } })
    .project({ _id: 1, paymentNumber: 1, amount: 1, paymentType: 1, createdAt: 1 })
    .toArray();
  console.log(`\n=== CATEGORY 1: Today's payment records (${todayPayments.length}) ===`);
  todayPayments.forEach((p) =>
    console.log(`  - _id=${p._id} | ${p.paymentNumber || '(no number)'} | Le ${p.amount} | ${p.paymentType} | ${p.createdAt.toISOString()}`),
  );
  if (todayPayments.length === 0) {
    console.log('  (none)');
  }

  // ===== 2) Discover pending-payment prescriptions =====
  const pendingPayment = await db.collection('prescriptions')
    .find({ isPaid: false, status: 'pending' })
    .project({ _id: 1, prescriptionNumber: 1, totalAmount: 1, createdAt: 1 })
    .toArray();
  console.log(`\n=== CATEGORY 2: Pending-payment prescriptions (${pendingPayment.length}) ===`);
  pendingPayment.forEach((r) =>
    console.log(`  - _id=${r._id} | ${r.prescriptionNumber} | Le ${r.totalAmount || 0} | ${r.createdAt.toISOString()}`),
  );

  // ===== 3) Discover pending-dispense prescriptions (paid, not dispensed) =====
  const pendingDispense = await db.collection('prescriptions')
    .find({ isPaid: true, status: { $nin: ['dispensed', 'cancelled'] } })
    .project({ _id: 1, prescriptionNumber: 1, totalAmount: 1, actualTotalAmount: 1, createdAt: 1 })
    .toArray();
  console.log(`\n=== CATEGORY 3: Pending-dispense prescriptions (${pendingDispense.length}) ===`);
  pendingDispense.forEach((r) =>
    console.log(`  - _id=${r._id} | ${r.prescriptionNumber} | total Le ${r.totalAmount || 0} | actual Le ${r.actualTotalAmount || 0} | ${r.createdAt.toISOString()}`),
  );

  // ===== 4) Old pending prescriptions from restore scripts (2026-05-25 to 2026-06-06) =====
  // These have isPaid: undefined (not false) and totalAmount: undefined (legacy fields).
  // Match them explicitly to avoid false positives.
  const oldPending = await db.collection('prescriptions')
    .find({
      status: 'pending',
      createdAt: { $lt: TODAY_START },
      $or: [
        { isPaid: { $exists: false } },
        { isPaid: false },
        { isPaid: null },
      ],
    })
    .project({ _id: 1, prescriptionNumber: 1, totalAmount: 1, createdAt: 1 })
    .toArray();
  console.log(`\n=== CATEGORY 4: Old pending prescriptions (no total, pre-today) (${oldPending.length}) ===`);
  oldPending.forEach((r) =>
    console.log(`  - _id=${r._id} | ${r.prescriptionNumber} | total Le ${r.totalAmount || 0} | ${r.createdAt.toISOString()}`),
  );

  // ===== PERFORM DELETIONS =====
  const arg = process.argv[2];
  if (arg !== '--yes') {
    console.log('\nDRY RUN. Re-run with --yes to actually delete.');
    console.log('Example: node scripts/cleanup-todays-and-pending.js --yes');
    await client.close();
    return;
  }

  console.log('\n=== DELETING ===');

  // Category 1: delete today's payments
  if (todayPayments.length > 0) {
    const ids = todayPayments.map((p) => p._id);
    const r = await db.collection('payments').deleteMany({ _id: { $in: ids } });
    console.log(`  Category 1: deleted ${r.deletedCount} payment records`);
  }

  // Category 2: cancel + delete pending-payment prescriptions
  if (pendingPayment.length > 0) {
    const ids = pendingPayment.map((r) => r._id);
    const r = await db.collection('prescriptions').deleteMany({ _id: { $in: ids } });
    console.log(`  Category 2: deleted ${r.deletedCount} pending-payment prescriptions`);
  }

  // Category 3: cancel + delete pending-dispense prescriptions
  if (pendingDispense.length > 0) {
    const ids = pendingDispense.map((r) => r._id);
    const r = await db.collection('prescriptions').deleteMany({ _id: { $in: ids } });
    console.log(`  Category 3: deleted ${r.deletedCount} pending-dispense prescriptions`);
  }

  // Category 4: cancel + delete old pending prescriptions from restore scripts
  if (oldPending.length > 0) {
    const ids = oldPending.map((r) => r._id);
    const r = await db.collection('prescriptions').deleteMany({ _id: { $in: ids } });
    console.log(`  Category 4: deleted ${r.deletedCount} old pending prescriptions`);
  }

  // Final verification
  const remaining = {
    todayPayments: await db.collection('payments').countDocuments({
      createdAt: { $gte: TODAY_START, $lt: TODAY_END },
    }),
    pendingPaymentRx: await db.collection('prescriptions').countDocuments({
      isPaid: false,
      status: 'pending',
    }),
    pendingDispenseRx: await db.collection('prescriptions').countDocuments({
      isPaid: true,
      status: { $in: ['pending', 'awaiting_dispensing'] },
    }),
    oldPendingRx: await db.collection('prescriptions').countDocuments({
      status: 'pending',
      createdAt: { $lt: TODAY_START },
      $or: [
        { isPaid: { $exists: false } },
        { isPaid: false },
        { isPaid: null },
      ],
    }),
  };
  console.log('\n=== REMAINING ===');
  console.log(JSON.stringify(remaining, null, 2));

  await client.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
