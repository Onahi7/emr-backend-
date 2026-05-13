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

  const fshRanges = [
    { ageGroup: 'Female Follicular', gender: 'F', range: '2.9-12.5', unit: 'mIU/mL' },
    { ageGroup: 'Female Ovulation', gender: 'F', range: '5.6-21.5', unit: 'mIU/mL' },
    { ageGroup: 'Female Luteal', gender: 'F', range: '1.5-7.7', unit: 'mIU/mL' },
    { ageGroup: 'Female Postmenopausal', gender: 'F', range: '23.0-134.8', unit: 'mIU/mL' },
    { ageGroup: 'Male', gender: 'M', range: '1.9-18.3', unit: 'mIU/mL' },
  ];

  const result = await catalog.updateOne(
    { code: 'FSH' },
    {
      $set: {
        referenceRanges: fshRanges,
      },
    }
  );

  if (result.modifiedCount > 0) {
    console.log('✅ FSH reference ranges updated to match images');
    console.log('\nUpdated ranges:');
    fshRanges.forEach(r => {
      console.log(`  ${r.ageGroup}: ${r.range}`);
    });
  } else {
    console.log('⚠️  FSH not found or no changes needed');
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
