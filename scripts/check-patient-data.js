const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGODB_URI);
  const db = m.connection.db;
  const withChronic = await db.collection('patients').countDocuments({ chronicConditions: { $exists: true, $ne: [] } });
  const withAllergies = await db.collection('patients').countDocuments({ allergies: { $exists: true, $ne: [] } });
  const total = await db.collection('patients').countDocuments({});
  console.log('Total patients:', total);
  console.log('Patients with chronicConditions:', withChronic);
  console.log('Patients with allergies:', withAllergies);
  process.exit(0);
})();
