/**
 * Backfill: add branchId to consultation Payment records that are missing it.
 * Run once: node scripts/backfill-consultation-payments.js
 */
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/emr';
const BRANCH_ID = '6a18cecb719ac95c1ebade70'; // Allen Town

async function run() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();

    // Find consultation payments without branchId
    const filter = {
      paymentType: 'consultation',
      $or: [
        { branchId: { $exists: false } },
        { branchId: null },
      ],
    };

    const count = await db.collection('payments').countDocuments(filter);
    console.log(`Found ${count} consultation payments missing branchId`);

    if (count === 0) {
      console.log('Nothing to backfill');
      return;
    }

    // For each, look up the visit to get its branchId
    const payments = await db.collection('payments').find(filter).toArray();
    let updated = 0;
    let skipped = 0;

    for (const payment of payments) {
      let branchId = null;

      if (payment.visitId) {
        const visit = await db.collection('visits').findOne({ _id: payment.visitId });
        if (visit?.branchId) {
          branchId = visit.branchId;
        }
      }

      if (!branchId) {
        // Default to Allen Town
        branchId = new ObjectId(BRANCH_ID);
      }

      await db.collection('payments').updateOne(
        { _id: payment._id },
        { $set: { branchId } }
      );
      updated++;
    }

    console.log(`Updated ${updated} consultation payments with branchId`);
  } finally {
    await client.close();
  }
}

run().catch(console.error);
