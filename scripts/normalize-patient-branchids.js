// One-time migration: convert string branchId to ObjectId in patient docs
// (and any other collections where this happened). Idempotent.

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
(async () => {
  const envFile = path.join(__dirname, '..', '.env.production');
  const envContent = fs.readFileSync(envFile, 'utf-8');
  const m = envContent.match(/^MONGODB_URI=(.+)$/m);
  const uri = m[1].trim();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Find all patients with string branchId
  const patients = await db.collection('patients').find({ branchId: { $type: 'string' } }).toArray();
  console.log(`Found ${patients.length} patients with string branchId`);
  for (const p of patients) {
    try {
      const newId = new ObjectId(p.branchId);
      const r = await db.collection('patients').updateOne(
        { _id: p._id },
        { $set: { branchId: newId } },
      );
      console.log(`  ${p.patientId}: updated=${r.modifiedCount} -> ObjectId(${p.branchId})`);
    } catch (e) {
      console.log(`  ${p.patientId}: invalid string branchId "${p.branchId}", skipping`);
    }
  }

  // Verify
  const stillString = await db.collection('patients').countDocuments({ branchId: { $type: 'string' } });
  const totalAtBranch = await db.collection('patients').countDocuments({ branchId: new ObjectId('6a18cecb719ac95c1ebade70') });
  console.log(`\nAfter migration:`);
  console.log(`  Patients with string branchId: ${stillString}`);
  console.log(`  Patients at Allen Town branch: ${totalAtBranch}`);
  await client.close();
})();
