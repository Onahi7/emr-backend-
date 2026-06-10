const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGODB_URI);
  const db = m.connection.db;

  const paulProfileId = '6a0082f2879b4e437682b52d';

  console.log('Setting all in_consultation visit.doctorId = Dr. Paul Profile._id:', paulProfileId);
  const r1 = await db.collection('visits').updateMany(
    { status: 'in_consultation' },
    { $set: { doctorId: new m.Types.ObjectId(paulProfileId) } }
  );
  console.log('Matched:', r1.matchedCount, 'Modified:', r1.modifiedCount);

  const awaiting = await db.collection('visits').updateMany(
    { status: 'awaiting_triage' },
    { $set: { doctorId: new m.Types.ObjectId(paulProfileId) } }
  );
  console.log('awaiting_triage Matched:', awaiting.matchedCount, 'Modified:', awaiting.modifiedCount);

  const after = await db.collection('visits').aggregate([
    { $group: { _id: { status: '$status', doctorId: '$doctorId' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('\nAll visit (status, doctorId) groups:');
  after.forEach(g => console.log('  ', g._id.status, '|', g._id.doctorId?.toString(), '| n=', g.count));

  process.exit(0);
})();
