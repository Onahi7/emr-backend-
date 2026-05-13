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

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
  const db = mongoose.connection.db;

  const tests = await db.collection('ordertests').find({ orderId: new mongoose.Types.ObjectId('69e640c5145a91abc95993ba') }).toArray();
  console.log(`OrderTests count: ${tests.length}`);
  tests.forEach(t => console.log(`  - ${t.testCode} | ${t.testName} | panel: ${t.panelCode || 'none'} | status: ${t.status}`));

  const alt = await db.collection('order_tests').find({ orderId: new mongoose.Types.ObjectId('69e640c5145a91abc95993ba') }).toArray();
  console.log(`\norder_tests (correct collection) count: ${alt.length}`);
  alt.forEach(t => console.log(`  - ${t.testCode} | ${t.testName} | panel: ${t.panelCode || 'none'}`));

  await mongoose.disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });
