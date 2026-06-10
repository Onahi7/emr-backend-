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
  // Find the 2 newly created patients
  const newOnes = await db.collection('patients').find({ patientId: { $in: ['PAT-20260610-0001', 'PAT-20260610-0002'] } }).toArray();
  newOnes.forEach((p) => {
    console.log(`${p.patientId} | branchId: ${p.branchId} | typeof: ${typeof p.branchId} | constructor: ${p.branchId?.constructor?.name}`);
  });
  // Find an old one
  const oldOne = await db.collection('patients').findOne({ patientId: 'PAT-20260605-0005' });
  console.log(`\n${oldOne.patientId} | branchId: ${oldOne.branchId} | typeof: ${typeof oldOne.branchId} | constructor: ${oldOne.branchId?.constructor?.name}`);
  // Get raw document via toBSON
  const newRaw = await db.collection('patients').findOne({ patientId: 'PAT-20260610-0001' });
  const oldRaw = await db.collection('patients').findOne({ patientId: 'PAT-20260605-0005' });
  console.log(`\nNEW raw branchId JSON: ${JSON.stringify(newRaw.branchId)}`);
  console.log(`OLD raw branchId JSON: ${JSON.stringify(oldRaw.branchId)}`);
  await client.close();
})();
