/**
 * One-time script: delete all records for Dickson Hardy and Jalloh Dembe
 * Run with:  npx ts-node -P tsconfig.json scripts/delete-patients.ts
 */
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

const NAMES = ['Sarah Johnson'];

async function run() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI or DATABASE_URL must be set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db!;

  // ── 1. Find patients ──────────────────────────────────────────────────────
  const patientColl = db.collection('patients');
  const patients = await patientColl
    .find({
      $or: NAMES.map((name) => {
        const [first, last] = name.split(' ');
        return {
          $or: [
            // stored as firstName + lastName
            {
              firstName: { $regex: new RegExp(`^${first}$`, 'i') },
              lastName:  { $regex: new RegExp(`^${last}$`,  'i') },
            },
            // stored as fullName
            { fullName: { $regex: new RegExp(name, 'i') } },
          ],
        };
      }),
    })
    .toArray();

  if (patients.length === 0) {
    console.log('⚠️  No patients found with those names.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${patients.length} patient(s):`);
  patients.forEach((p) => console.log(`  • ${p.firstName} ${p.lastName}  (_id: ${p._id})`));

  const patientIds = patients.map((p) => p._id);

  // ── 2. Find orders for these patients ────────────────────────────────────
  const orderColl = db.collection('orders');
  const orders = await orderColl
    .find({ patientId: { $in: patientIds } })
    .toArray();

  const orderIds = orders.map((o) => o._id);
  console.log(`Found ${orders.length} order(s) for these patients.`);

  // ── 3. Delete results linked to those orders ──────────────────────────────
  if (orderIds.length > 0) {
    const resultColl = db.collection('results');
    const rDel = await resultColl.deleteMany({ orderId: { $in: orderIds } });
    console.log(`Deleted ${rDel.deletedCount} result(s).`);

    const sampleColl = db.collection('samples');
    const sDel = await sampleColl.deleteMany({ orderId: { $in: orderIds } });
    console.log(`Deleted ${sDel.deletedCount} sample(s).`);

    // Delete order tests (sub-documents sometimes stored separately)
    const orderTestColl = db.collection('ordertests');
    const otDel = await orderTestColl.deleteMany({ orderId: { $in: orderIds } });
    console.log(`Deleted ${otDel.deletedCount} order-test record(s).`);

    const paymentColl = db.collection('payments');
    const pDel = await paymentColl.deleteMany({ orderId: { $in: orderIds } });
    console.log(`Deleted ${pDel.deletedCount} payment(s).`);
  }

  // ── 4. Delete the orders ──────────────────────────────────────────────────
  if (orderIds.length > 0) {
    const oDel = await orderColl.deleteMany({ _id: { $in: orderIds } });
    console.log(`Deleted ${oDel.deletedCount} order(s).`);
  }

  // ── 5. Delete audit logs for these patients / orders ─────────────────────
  const auditColl = db.collection('auditlogs');
  const aDelPatient = await auditColl.deleteMany({ patientId: { $in: patientIds } });
  const aDelOrder   = orderIds.length
    ? await auditColl.deleteMany({ orderId: { $in: orderIds } })
    : { deletedCount: 0 };
  console.log(`Deleted ${aDelPatient.deletedCount + aDelOrder.deletedCount} audit log(s).`);

  // ── 6. Delete the patients themselves ────────────────────────────────────
  const ptDel = await patientColl.deleteMany({ _id: { $in: patientIds } });
  console.log(`Deleted ${ptDel.deletedCount} patient record(s).`);

  console.log('\n✅  Done. All records for the specified patients have been removed.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌  Script failed:', err);
  process.exit(1);
});
