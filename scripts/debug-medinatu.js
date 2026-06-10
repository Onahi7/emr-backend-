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
  // Find Medinatu
  const m1 = await db.collection('patients').find({ patientId: 'PAT-20260606-0004' }).toArray();
  m1.forEach((p) => console.log(`Medinatu: ${p.patientId} | branchId: ${p.branchId} (typeof ${typeof p.branchId})`));
  // List all branches
  const branches = await db.collection('branches').find({}).toArray();
  console.log('\nBranches:');
  branches.forEach((b) => console.log(`  ${b._id} | ${b.code} | ${b.name}`));
  // Check how many patients per branch
  const byBranch = await db.collection('patients').aggregate([
    { $group: { _id: '$branchId', count: { $sum: 1 } } }
  ]).toArray();
  console.log('\nPatients by branch:');
  byBranch.forEach((b) => console.log(`  ${b._id || 'unassigned'}: ${b.count}`));
  await client.close();
})();
