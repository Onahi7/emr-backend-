const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const envFile = path.join(__dirname, '..', '.env.production');
const envText = fs.readFileSync(envFile, 'utf8');
const envLines = envText.split(/\r?\n/);
for (const line of envLines) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const today = new Date('2026-06-05T00:00:00Z');
  const pDel = await db.collection('patients').deleteMany({ createdAt: { $gte: today } });
  console.log('Patients deleted (created 2026-06-05):', pDel.deletedCount);
  const vDel = await db.collection('visits').deleteMany({ createdAt: { $gte: today } });
  console.log('Visits deleted (created 2026-06-05):', vDel.deletedCount);
  const payDel = await db.collection('payments').deleteMany({ createdAt: { $gte: today } });
  console.log('Payments deleted (created 2026-06-05):', payDel.deletedCount);
  const dDel = await db.collection('doctors').deleteMany({ fullName: 'Dr. Paul Carefam' });
  console.log('Doctors deleted:', dDel.deletedCount);
  await mongoose.disconnect();
})();
