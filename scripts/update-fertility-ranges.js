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

  const updates = [
    {
      code: 'FSH',
      name: 'Follicle Stimulating Hormone',
      unit: 'mIU/mL',
      referenceRanges: [
        { ageGroup: 'Female Follicular', gender: 'F', range: '3.5-12.5', unit: 'mIU/mL' },
        { ageGroup: 'Female Ovulation', gender: 'F', range: '4.7-21.5', unit: 'mIU/mL' },
        { ageGroup: 'Female Luteal', gender: 'F', range: '1.7-7.7', unit: 'mIU/mL' },
        { ageGroup: 'Female Postmenopausal', gender: 'F', range: '25.8-134.8', unit: 'mIU/mL' },
        { ageGroup: 'Male', gender: 'M', range: '1.9-18.3', unit: 'mIU/mL' },
      ],
    },
    {
      code: 'LH',
      name: 'Luteinizing Hormone',
      unit: 'mIU/mL',
      referenceRanges: [
        { ageGroup: 'Female Follicular', gender: 'F', range: '2.4-12.6', unit: 'mIU/mL' },
        { ageGroup: 'Female Ovulation', gender: 'F', range: '14.0-95.6', unit: 'mIU/mL' },
        { ageGroup: 'Female Luteal', gender: 'F', range: '1.0-11.4', unit: 'mIU/mL' },
        { ageGroup: 'Female Postmenopausal', gender: 'F', range: '7.7-58.5', unit: 'mIU/mL' },
        { ageGroup: 'Male', gender: 'M', range: '1.5-9.3', unit: 'mIU/mL' },
      ],
    },
    {
      code: 'AMH',
      name: 'Anti-Müllerian Hormone',
      unit: 'ng/mL',
      referenceRanges: [
        { ageGroup: '18-25 years', gender: 'F', range: '0.9-7.5', unit: 'ng/mL' },
        { ageGroup: '26-30 years', gender: 'F', range: '0.5-6.8', unit: 'ng/mL' },
        { ageGroup: '31-35 years', gender: 'F', range: '0.2-5.5', unit: 'ng/mL' },
        { ageGroup: '36-40 years', gender: 'F', range: '0.1-3.5', unit: 'ng/mL' },
        { ageGroup: '41-45 years', gender: 'F', range: '0.03-2.5', unit: 'ng/mL' },
        { ageGroup: '46-50 years', gender: 'F', range: '0.01-1.5', unit: 'ng/mL' },
      ],
    },
    {
      code: 'ESTRADIOL',
      name: 'Estradiol (E2)',
      unit: 'pg/mL',
      referenceRanges: [
        { ageGroup: 'Female Follicular', gender: 'F', range: '12-166', unit: 'pg/mL' },
        { ageGroup: 'Female Ovulation', gender: 'F', range: '85-498', unit: 'pg/mL' },
        { ageGroup: 'Female Luteal', gender: 'F', range: '43-211', unit: 'pg/mL' },
        { ageGroup: 'Female Postmenopausal', gender: 'F', range: '<10-28', unit: 'pg/mL' },
        { ageGroup: 'Male', gender: 'M', range: '10-40', unit: 'pg/mL' },
      ],
    },
    {
      code: 'PROG',
      name: 'Progesterone',
      unit: 'ng/mL',
      referenceRanges: [
        { ageGroup: 'Female Follicular', gender: 'F', range: '<0.5', unit: 'ng/mL' },
        { ageGroup: 'Female Ovulation', gender: 'F', range: '<0.5', unit: 'ng/mL' },
        { ageGroup: 'Female Luteal', gender: 'F', range: '3-25', unit: 'ng/mL' },
        { ageGroup: 'Female Postmenopausal', gender: 'F', range: '<0.4', unit: 'ng/mL' },
      ],
    },
    {
      code: 'PROLACTIN',
      name: 'Prolactin',
      unit: 'ng/mL',
      referenceRanges: [
        { ageGroup: 'Male', gender: 'M', range: '3-13', unit: 'ng/mL' },
        { ageGroup: 'Female Non-pregnant', gender: 'F', range: '3-27', unit: 'ng/mL' },
        { ageGroup: 'Female Pregnant', gender: 'F', range: '10-209', unit: 'ng/mL' },
      ],
    },
  ];

  for (const test of updates) {
    const result = await catalog.updateOne(
      { code: test.code },
      {
        $set: {
          name: test.name,
          unit: test.unit,
          referenceRanges: test.referenceRanges,
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Updated ${test.code} (${test.name})`);
    } else {
      console.log(`⚠️  ${test.code} not found or no changes needed`);
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Fertility hormone reference ranges updated');
}

run().catch(e => { console.error(e.message); process.exit(1); });
