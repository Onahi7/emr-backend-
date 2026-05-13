/**
 * add-test-to-order.js
 * Adds a missing test (e.g. APTT) to an existing order's orderTests.
 * Usage: node scripts/add-test-to-order.js
 */
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  });
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

// ── CONFIG ────────────────────────────────────────────────
const PATIENT_NAME_SEARCH = 'nwoko chinaza';
const TESTS_TO_ADD        = ['ESTRADIOL'];
const PANEL_CODE          = null;
// ─────────────────────────────────────────────────────────

async function run() {
  if (!MONGODB_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const patients   = db.collection('patients');
  const orders     = db.collection('orders');
  const orderTests = db.collection('order_tests');
  const catalog    = db.collection('test_catalog');

  // 1. Find patient
  const nameParts = PATIENT_NAME_SEARCH.trim().split(/\s+/);
  const orClauses = nameParts.flatMap(p => [
    { firstName: { $regex: p, $options: 'i' } },
    { lastName:  { $regex: p, $options: 'i' } },
  ]);
  const allMatches = await patients.find({ $or: orClauses }).toArray();
  console.log('Matches found:', allMatches.map(p => `${p.firstName} ${p.lastName}`));
  // Pick the one where ALL name parts match somewhere
  const patient = allMatches.find(p => {
    const full = `${p.firstName} ${p.lastName}`.toLowerCase();
    return nameParts.every(part => full.includes(part.toLowerCase()));
  }) || allMatches[0];

  if (!patient) {
    console.error(`❌ Patient "${PATIENT_NAME_SEARCH}" not found`);
    await mongoose.disconnect(); process.exit(1);
  }
  console.log(`👤 Patient: ${patient.firstName} ${patient.lastName} (${patient._id})`);

  // 2. Find today's order for this patient
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);

  const order = await orders.findOne({
    patientId: patient._id,
    createdAt: { $gte: todayStart, $lte: todayEnd },
  });

  if (!order) {
    console.error(`❌ No order found for this patient today`);
    await mongoose.disconnect(); process.exit(1);
  }
  console.log(`📋 Order: ${order.orderNumber} (${order._id})`);

  // 3. Loop over each test to add
  for (const testCode of TESTS_TO_ADD) {
    const existing = await orderTests.findOne({ orderId: order._id, testCode });
    if (existing) {
      console.log(`ℹ️  ${testCode} already exists — skipping`);
      continue;
    }

    const test = await catalog.findOne({ code: testCode });
    if (!test) {
      console.error(`❌ ${testCode} not found in test_catalog — skipping`);
      continue;
    }

    await orderTests.insertOne({
      orderId:   order._id,
      testId:    test._id,
      testCode:  test.code,
      testName:  test.name,
      ...(PANEL_CODE ? { panelCode: PANEL_CODE, panelName: test.panelName || PANEL_CODE } : {}),
      status:    'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`✅ ${testCode} (${test.name}) added`);
  }
  await mongoose.disconnect();
  console.log('\n✅ Done');
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
