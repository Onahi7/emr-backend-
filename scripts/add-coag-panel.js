/**
 * add-coag-panel.js
 * Adds INR test + COAG panel (PT + APTT + INR) to the live database.
 * Safe to run: only inserts/updates, does not wipe existing data.
 */
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load .env manually (no dotenv dependency needed)
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  });
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function run() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;
  const catalog = db.collection('test_catalog');
  const orderTests = db.collection('order_tests');
  const panels = db.collection('test_panels');

  // 1. Upsert PT, APTT, INR into test_catalog
  const coagTestDefs = [
    {
      code: 'PT',
      name: 'Prothrombin Time',
      unit: 'seconds',
      description: 'Measures the extrinsic coagulation pathway',
      referenceRanges: [
        { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: '10.0-13.9', unit: 'seconds' },
      ],
    },
    {
      code: 'INR',
      name: 'International Normalised Ratio',
      unit: 'ratio',
      price: 0,
      description: 'Standardised ratio derived from Prothrombin Time (no separate charge)',
      referenceRanges: [
        { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: '0.7-1.3', unit: 'ratio' },
      ],
    },
    {
      code: 'APTT',
      name: 'Activated Partial Thromboplastin Time',
      unit: 'seconds',
      description: 'Measures the intrinsic coagulation pathway',
      referenceRanges: [
        { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: '22.2-37.9', unit: 'seconds' },
      ],
    },
    {
      code: 'FIB',
      name: 'Fibrinogen',
      unit: 'g/L',
      description: 'Clotting factor I — key substrate in clot formation',
      referenceRanges: [
        { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: '2.0-4.0', unit: 'g/L' },
      ],
    },
    {
      code: 'ACT',
      name: 'Activated Clotting Time',
      unit: 'seconds',
      description: 'Measures overall coagulation via whole blood clotting',
      referenceRanges: [
        { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: '80-140', unit: 'seconds' },
      ],
    },
  ];

  for (const def of coagTestDefs) {
    const r = await catalog.updateOne(
      { code: def.code },
      {
        $set: {
          unit: def.unit,
          description: def.description,
          referenceRanges: def.referenceRanges,
          ...(def.price !== undefined ? { price: def.price } : {}),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          code: def.code,
          name: def.name,
          category: 'hematology',
          sampleType: 'blood',
          turnaroundTime: 30,
          isActive: true,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    console.log(r.upsertedCount ? `✅ ${def.code} created` : `✅ ${def.code} updated`);
  }

  // 2. Fetch panel test entries: PT, INR, APTT, FIB
  const coagCodes = ['PT', 'INR', 'APTT', 'FIB', 'ACT'];
  const tests = await catalog.find({ code: { $in: coagCodes } }).toArray();

  const missing = coagCodes.filter(c => !tests.find(t => t.code === c));
  if (missing.length) {
    console.error(`❌ Missing tests in catalog: ${missing.join(', ')}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const testItems = coagCodes.map(code => {
    const t = tests.find(t => t.code === code);
    return { testId: t._id, testCode: t.code, testName: t.name };
  });

  // 3. Upsert COAG panel
  const panelResult = await panels.updateOne(
    { code: 'COAG' },
    {
      $set: {
        code: 'COAG',
        name: 'Coagulation Profile',
        description: 'Coagulation screen - PT/INR, APTT, Fibrinogen, ACT',
        price: 700,
        isActive: true,
        tests: testItems,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  console.log(panelResult.upsertedCount ? '✅ COAG panel created' : '✅ COAG panel updated');
  console.log('   Tests:', testItems.map(t => t.testCode).join(', '));

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
