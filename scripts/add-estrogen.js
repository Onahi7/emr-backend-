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
  if (!MONGODB_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const catalog = db.collection('test_catalog');

  // Check what estrogen-related tests exist
  const existing = await catalog.find({
    $or: [
      { code: { $in: ['ESTRADIOL', 'ESTROGEN', 'E2', 'E3', 'OESTRIOL'] } },
      { name: { $regex: 'estro|oestro|estrad', $options: 'i' } },
    ]
  }).toArray();

  console.log('Existing estrogen-related tests:');
  existing.forEach(t => console.log(`  ${t.code} | ${t.name} | active: ${t.isActive}`));

  const testDef = {
    code: 'ESTRADIOL',
    name: 'Estradiol (E2)',
    category: 'immunoassay',
    sampleType: 'blood',
    price: 280,
    unit: 'pg/mL',
    turnaroundTime: 60,
    isActive: true,
    description: 'Measures estradiol (oestradiol) hormone level',
    referenceRanges: [
      { ageGroup: 'Male',              ageMin: 18, gender: 'M',   range: '10-40',    unit: 'pg/mL' },
      { ageGroup: 'Female – Follicular', ageMin: 18, gender: 'F', range: '12-166',   unit: 'pg/mL' },
      { ageGroup: 'Female – Ovulatory',  ageMin: 18, gender: 'F', range: '85-498',   unit: 'pg/mL' },
      { ageGroup: 'Female – Luteal',     ageMin: 18, gender: 'F', range: '43-211',   unit: 'pg/mL' },
      { ageGroup: 'Postmenopausal',      ageMin: 50, gender: 'F', range: '<10-28',   unit: 'pg/mL' },
    ],
  };

  const result = await catalog.updateOne(
    { code: testDef.code },
    {
      $set: {
        name: testDef.name,
        category: testDef.category,
        sampleType: testDef.sampleType,
        price: testDef.price,
        unit: testDef.unit,
        turnaroundTime: testDef.turnaroundTime,
        isActive: testDef.isActive,
        description: testDef.description,
        referenceRanges: testDef.referenceRanges,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  if (result.upsertedCount) {
    console.log('✅ ESTRADIOL added to catalog');
  } else {
    console.log('✅ ESTRADIOL updated in catalog');
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
