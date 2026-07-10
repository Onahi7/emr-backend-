const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required. Refusing to run migration without an explicit database URI.');
  process.exit(1);
}

const ALLEN_TOWN = new ObjectId('6a18cecb719ac95c1ebade70');
const CONGO_CROSS = new ObjectId('6a18cecb719ac95c1ebade71');

// Skip this patient — phone conflict (already exists in Allen Town as Melvin Ifeanyichukwu)
const SKIP_PATIENT_ID = new ObjectId(); // will lookup below

// Congo Cross staff emails — assign to Congo Cross branch
const CC_STAFF_EMAILS = [
  'admin.congo@harbourmed.com',
  'reception.congo@harbourmed.com',
  'doctor.congo@harbourmed.com',
  'labtech.congo@harbourmed.com',
  'pharmacy.congo@harbourmed.com',
];

async function run() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  const execute = process.argv.includes('--execute');
  const dryRun = !execute;

  try {
    await client.connect();
    const db = client.db('carefaamemr');

    console.log('========================================');
    console.log('  ORPHANED RECORDS MIGRATION');
    console.log(`  Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    console.log('========================================\n');

    const noBranch = { $or: [{ branchId: { $exists: false } }, { branchId: null }] };

    // --- PATIENTS ---
    console.log('--- PATIENTS ---');
    const orphanPatients = await db.collection('patients').find(noBranch).toArray();
    const skipPatient = orphanPatients.find(p =>
      p.firstName?.toLowerCase() === 'jecinta' && p.lastName?.toLowerCase() === 'chukwuma'
    );
    const patientsToMigrate = orphanPatients.filter(p => p._id !== skipPatient?._id);

    console.log(`  Found: ${orphanPatients.length} orphans`);
    if (skipPatient) {
      console.log(`  Skipping: ${skipPatient.firstName} ${skipPatient.lastName} (${skipPatient.patientId}) — phone conflict`);
    }
    console.log(`  Migrating: ${patientsToMigrate.length} patients → Allen Town`);

    // --- VISITS ---
    console.log('\n--- VISITS ---');
    const orphanVisits = await db.collection('visits').countDocuments(noBranch);
    console.log(`  Migrating: ${orphanVisits} visits → Allen Town`);

    // --- PAYMENTS ---
    console.log('\n--- PAYMENTS ---');
    const orphanPayments = await db.collection('payments').find(noBranch).toArray();
    const totalPaymentAmount = orphanPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    console.log(`  Migrating: ${orphanPayments.length} payments → Allen Town`);
    console.log(`  Total amount: Le ${totalPaymentAmount.toLocaleString()}`);

    // --- ORDERS ---
    console.log('\n--- ORDERS ---');
    const orphanOrders = await db.collection('orders').countDocuments(noBranch);
    console.log(`  Migrating: ${orphanOrders} orders → Allen Town`);

    // --- PRESCRIPTIONS ---
    console.log('\n--- PRESCRIPTIONS ---');
    const orphanRx = await db.collection('prescriptions').countDocuments(noBranch);
    console.log(`  Migrating: ${orphanRx} prescriptions → Allen Town`);

    // --- PROFILES ---
    console.log('\n--- PROFILES ---');
    const orphanProfiles = await db.collection('profiles').find(noBranch).toArray();
    const ccProfiles = orphanProfiles.filter(p => CC_STAFF_EMAILS.includes(p.email));
    const atProfiles = orphanProfiles.filter(p => !CC_STAFF_EMAILS.includes(p.email));
    console.log(`  Found: ${orphanProfiles.length} orphans`);
    console.log(`  → Congo Cross: ${ccProfiles.length} staff (${ccProfiles.map(p => p.fullName).join(', ')})`);
    console.log(`  → Allen Town: ${atProfiles.length} (${atProfiles.map(p => p.fullName).join(', ')})`);

    if (dryRun) {
      console.log('\n========================================');
      console.log('  DRY RUN COMPLETE — no changes made');
      console.log('  Re-run with --execute to apply these updates');
      console.log('========================================');
      return;
    }

    // === EXECUTE MIGRATION ===
    console.log('\n========================================');
    console.log('  EXECUTING MIGRATION...');
    console.log('========================================\n');

    // Patients
    if (patientsToMigrate.length > 0) {
      const skipIds = [skipPatient?._id].filter(Boolean);
      const result = await db.collection('patients').updateMany(
        { branchId: null, _id: { $nin: skipIds } },
        { $set: { branchId: ALLEN_TOWN } }
      );
      console.log(`  Patients: ${result.modifiedCount} migrated`);
    }

    // Visits
    const visResult = await db.collection('visits').updateMany(noBranch, { $set: { branchId: ALLEN_TOWN } });
    console.log(`  Visits: ${visResult.modifiedCount} migrated`);

    // Payments
    const payResult = await db.collection('payments').updateMany(noBranch, { $set: { branchId: ALLEN_TOWN } });
    console.log(`  Payments: ${payResult.modifiedCount} migrated`);

    // Orders
    const ordResult = await db.collection('orders').updateMany(noBranch, { $set: { branchId: ALLEN_TOWN } });
    console.log(`  Orders: ${ordResult.modifiedCount} migrated`);

    // Prescriptions
    const rxResult = await db.collection('prescriptions').updateMany(noBranch, { $set: { branchId: ALLEN_TOWN } });
    console.log(`  Prescriptions: ${rxResult.modifiedCount} migrated`);

    // Profiles — Congo Cross staff
    if (ccProfiles.length > 0) {
      const ccResult = await db.collection('profiles').updateMany(
        { branchId: null, email: { $in: CC_STAFF_EMAILS } },
        { $set: { branchId: CONGO_CROSS } }
      );
      console.log(`  Profiles (Congo Cross staff): ${ccResult.modifiedCount} migrated`);
    }

    // Profiles — Allen Town / system
    if (atProfiles.length > 0) {
      const atEmails = atProfiles.map(p => p.email);
      const atResult = await db.collection('profiles').updateMany(
        { branchId: null, email: { $in: atEmails } },
        { $set: { branchId: ALLEN_TOWN } }
      );
      console.log(`  Profiles (Allen Town): ${atResult.modifiedCount} migrated`);
    }

    console.log('\n========================================');
    console.log('  MIGRATION COMPLETE');
    console.log('  Run verify-migration.js to confirm');
    console.log('========================================');

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
