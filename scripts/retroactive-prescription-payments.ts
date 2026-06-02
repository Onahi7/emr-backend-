/**
 * One-time script: find prescriptions with isPaid=true but no Payment record
 * and create the missing payment records retroactively.
 *
 * Run with:  npx ts-node -P tsconfig.json scripts/retroactive-prescription-payments.ts
 *
 *   --dry-run   : just list what would be created (default)
 *   --apply     : actually insert the missing payment records
 */
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI or DATABASE_URL must be set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '🔍 DRY-RUN mode — no changes will be made\n' : '⚠️  APPLY mode — records will be inserted\n');

  const db = mongoose.connection.db!;
  const prescriptionColl = db.collection('prescriptions');
  const paymentColl = db.collection('payments');

  // ── 1. Find all paid prescriptions ────────────────────────────────────────
  const paidPrescriptions = await prescriptionColl
    .find({ isPaid: true })
    .toArray();

  console.log(`Found ${paidPrescriptions.length} prescription(s) with isPaid=true.`);

  if (paidPrescriptions.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // ── 2. For each, check if a payment record already exists ────────────────
  const toCreate: any[] = [];
  let alreadyExists = 0;

  for (const rx of paidPrescriptions) {
    const existing = await paymentColl.findOne({
      paymentType: 'prescription',
      prescriptionId: rx._id,
    });

    if (existing) {
      alreadyExists++;
      continue;
    }

    toCreate.push({
      paymentType: 'prescription',
      amount: rx.totalAmount || 0,
      paymentMethod: 'cash', // unknown — default to cash for retroactive
      visitId: rx.visitId,
      prescriptionId: rx._id,
      notes: `Retroactive payment for prescription ${rx.prescriptionNumber || rx._id}`,
      isRefunded: false,
      createdAt: rx.updatedAt || new Date(),
      updatedAt: new Date(),
    });
  }

  console.log(`✓ ${alreadyExists} already have a payment record.`);
  console.log(`✗ ${toCreate.length} missing payment record(s):\n`);

  // ── 3. Display what would be / will be created ───────────────────────────
  for (const p of toCreate) {
    const rx = paidPrescriptions.find((r) => String(r._id) === String(p.prescriptionId));
    console.log(
      `  • ${rx?.prescriptionNumber || rx?._id}  amount=${p.amount}  visitId=${p.visitId}  paidAt=${rx?.updatedAt}`,
    );
  }

  // ── 4. Insert if --apply ──────────────────────────────────────────────────
  if (toCreate.length > 0 && !DRY_RUN) {
    const result = await paymentColl.insertMany(toCreate);
    console.log(`\n✅ Inserted ${result.insertedCount} payment record(s).`);
  } else if (toCreate.length > 0) {
    console.log(`\n💡 Re-run with --apply to insert these ${toCreate.length} records.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌  Script failed:', err);
  process.exit(1);
});
