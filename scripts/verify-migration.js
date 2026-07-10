const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required. Refusing to verify migration without an explicit database URI.');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const db = client.db('carefaamemr');
    const noBranch = { $or: [{ branchId: { $exists: false } }, { branchId: null }] };

    console.log('=== POST-MIGRATION VERIFICATION ===\n');

    const cols = ['patients', 'visits', 'orders', 'prescriptions', 'payments', 'profiles', 'medications'];
    let allClear = true;
    for (const col of cols) {
      const count = await db.collection(col).countDocuments(noBranch);
      const icon = count === 0 ? '✓' : '✗';
      console.log(`  ${icon} ${col}: ${count} orphans remaining`);
      if (count > 0) allClear = false;
    }

    console.log(allClear
      ? '\n✓ ALL CLEAR — no orphaned records remain'
      : '\n✗ ORPHANS STILL FOUND — check above');
  } finally {
    await client.close();
  }
}
run();
