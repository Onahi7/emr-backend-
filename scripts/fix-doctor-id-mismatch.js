const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGODB_URI);
  const db = m.connection.db;

  const paulDoctorId = '6a22e4b586cf12d8f12b3869';
  const orphanDoctorId = '6a22e433e1ebff4ef40c78aa';

  console.log('--- BEFORE ---');
  const beforeByDoctor = await db.collection('visits').aggregate([
    { $match: { status: 'in_consultation' } },
    { $group: { _id: '$doctorId', count: { $sum: 1 } } }
  ]).toArray();
  console.log('visits by doctorId:', beforeByDoctor);

  console.log('\nUpdating all in_consultation visit.doctorId to Dr. Paul Doctor._id:', paulDoctorId);
  const r1 = await db.collection('visits').updateMany(
    { status: 'in_consultation' },
    { $set: { doctorId: new m.Types.ObjectId(paulDoctorId) } }
  );
  console.log('Matched:', r1.matchedCount, 'Modified:', r1.modifiedCount);

  console.log('\nDeleting orphan Doctor record:', orphanDoctorId);
  const r2 = await db.collection('doctors').deleteOne({ _id: new m.Types.ObjectId(orphanDoctorId) });
  console.log('Deleted:', r2.deletedCount);

  console.log('\n--- AFTER ---');
  const after = await db.collection('visits').aggregate([
    { $match: { status: 'in_consultation' } },
    { $group: { _id: '$doctorId', count: { $sum: 1 } } }
  ]).toArray();
  console.log('visits by doctorId:', after);

  const docs = await db.collection('doctors').find({}).toArray();
  console.log('Remaining doctors:', docs.length, '|', docs.map(d => `${d._id}=${d.fullName}`).join(', '));

  process.exit(0);
})();
