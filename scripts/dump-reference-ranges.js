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

  const tests = await catalog.find({}).sort({ category: 1, code: 1 }).toArray();

  console.log('=== REFERENCE RANGES BY CATEGORY ===\n');

  const byCategory = {};
  tests.forEach(t => {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
  });

  for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`\n--- ${cat.toUpperCase()} ---`);
    items.forEach(t => {
      console.log(`\n${t.code} | ${t.name}`);
      if (t.referenceRanges && t.referenceRanges.length > 0) {
        t.referenceRanges.forEach(r => {
          const age = r.ageGroup || (r.ageMin !== undefined ? `≥${r.ageMin}y` : 'All ages');
          const gender = r.gender && r.gender !== 'all' ? ` (${r.gender})` : '';
          console.log(`  ${age}${gender}: ${r.range} ${r.unit || ''}`);
        });
      } else if (t.referenceRange) {
        console.log(`  ${t.referenceRange}`);
      } else {
        console.log('  (no reference range)');
      }
    });
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
