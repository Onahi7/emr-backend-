const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
(async () => {
  const envFile = path.join(__dirname, '..', '.env.production');
  const envContent = fs.readFileSync(envFile, 'utf-8');
  const m = envContent.match(/^MONGODB_URI=(.+)$/m);
  const uri = m[1].trim();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  // Look for any old prescriptions from restore scripts
  const old = await db.collection('prescriptions').find({
    prescriptionNumber: { $in: ['RX-20260605-0001', 'RX-20260605-0002', 'RX-20260603-0001', 'RX-20260603-0002', 'RX-20260602-0001'] }
  }).toArray();
  old.forEach((r) => console.log(r.prescriptionNumber, 'status:', r.status, 'isPaid:', r.isPaid, 'totalAmount:', r.totalAmount, 'createdAt:', r.createdAt.toISOString()));
  await client.close();
})();
