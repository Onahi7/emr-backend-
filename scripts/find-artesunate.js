const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGODB_URI);
  const db = m.connection.db;

  console.log('=== Looking for Artesunate medications ===');
  const artes = await db.collection('medications').find({
    $or: [
      { name: { $regex: /artesun|artem/i } },
      { genericName: { $regex: /artesun|artem/i } }
    ]
  }).toArray();
  artes.forEach(a => console.log('  ', a._id.toString(), '|', a.name, '|', a.genericName, '| stock:', a.stock, '|', a.strength));

  console.log('\n=== Abdulai Barma patient ===');
  const barma = await db.collection('patients').findOne({ patientId: 'PAT-20260605-0005' });
  console.log('  _id:', barma._id.toString(), '|', barma.firstName, barma.lastName, '| age', barma.age);

  const visit = await db.collection('visits').findOne({ patientId: barma._id, status: 'in_consultation' });
  console.log('  visit _id:', visit._id.toString(), '| visitNumber:', visit.visitNumber, '| createdAt:', visit.createdAt);

  process.exit(0);
})();
