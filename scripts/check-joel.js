const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  });
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // Find patient
  const patient = await db.collection('patients').findOne({
    $or: [
      { firstName: { $regex: 'joel', $options: 'i' } },
      { lastName: { $regex: 'kpongo', $options: 'i' } },
    ]
  });

  if (!patient) { console.log('❌ Patient not found'); process.exit(1); }
  console.log(`👤 Patient: ${patient.firstName} ${patient.lastName} (${patient._id})`);

  // Find orders
  const orders = await db.collection('orders').find({ patientId: patient._id }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log(`\n📋 Orders (latest 5):`);
  orders.forEach(o => console.log(`  ${o.orderNumber} | ${o._id} | ${o.createdAt?.toISOString?.() || o.createdAt}`));

  if (!orders.length) { await mongoose.disconnect(); return; }

  const latestOrder = orders[0];
  console.log(`\n🔍 Checking latest order: ${latestOrder.orderNumber}`);

  // order_tests
  const orderTests = await db.collection('order_tests').find({ orderId: latestOrder._id }).toArray();
  console.log(`\norder_tests (${orderTests.length}):`);
  orderTests.forEach(t => console.log(`  testCode: "${t.testCode}" | testName: "${t.testName}" | status: ${t.status}`));

  // results
  const results = await db.collection('results').find({ orderId: latestOrder._id }).toArray();
  console.log(`\nresults (${results.length}):`);
  results.forEach(r => {
    console.log(`  testCode: "${r.testCode}" | testName: "${r.testName}" | value: "${r.value}" | flag: "${r.flag}" | category: "${r.category}"`);
    if (r.value && r.value.includes('|')) {
      console.log(`    ⚠️  Value contains pipe character (structured stool value?): ${r.value}`);
    }
    if (!r.testCode) console.log(`    ❌ MISSING testCode`);
    if (!r.testName) console.log(`    ⚠️  MISSING testName`);
  });

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
