// One-time migration: assign the 5 unassigned patients to Allen Town branch
// (or to Congo Cross, depending on which branch the receptionist logs in from).
// This is a data fix — the restore scripts created patients without a branchId
// before the branchId filter was added.
//
// Run with: node scripts/assign-unassigned-patients.js [branchId]
// Default branchId: Allen Town (6a18cecb719ac95c1ebade70)

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
(async () => {
  const DEFAULT_BRANCH = '6a18cecb719ac95c1ebade70'; // Allen Town
const args = process.argv.slice(2);
const branchIdArg = args.find((a) => !a.startsWith('--')) || DEFAULT_BRANCH;
const confirmed = args.includes('--yes');
const arg = branchIdArg;
  const envFile = path.join(__dirname, '..', '.env.production');
  const envContent = fs.readFileSync(envFile, 'utf-8');
  const m = envContent.match(/^MONGODB_URI=(.+)$/m);
  const uri = m[1].trim();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // Find unassigned patients (no branchId field, null, or missing)
  const unassigned = await db.collection('patients').find({
    $or: [
      { branchId: { $exists: false } },
      { branchId: null },
    ],
  }).toArray();
  console.log(`Found ${unassigned.length} unassigned patients`);
  for (const p of unassigned) {
    console.log(`  - ${p.patientId} | ${p.firstName} ${p.lastName} (current branchId: ${p.branchId})`);
  }

  // Ask for confirmation
  if (!confirmed) {
    console.log(`\nDRY RUN. Re-run with --yes to assign them all to branch ${arg}.`);
    console.log(`Example: node scripts/assign-unassigned-patients.js ${arg} --yes`);
    await client.close();
    return;
  }

  const branchObjId = new ObjectId(arg);
  const branch = await db.collection('branches').findOne({ _id: branchObjId });
  if (!branch) {
    console.log(`Branch ${arg} not found`);
    await client.close();
    return;
  }
  console.log(`\nAssigning to: ${branch.name} (${branch.code})`);

  const r = await db.collection('patients').updateMany(
    { _id: { $in: unassigned.map((p) => p._id) } },
    { $set: { branchId: branchObjId } },
  );
  console.log(`Updated ${r.modifiedCount} patients`);

  // Verify
  const stillUnassigned = await db.collection('patients').countDocuments({
    $or: [{ branchId: { $exists: false } }, { branchId: null }],
  });
  console.log(`\nRemaining unassigned: ${stillUnassigned}`);

  await client.close();
})();
