const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGODB_URI);
  const db = m.connection.db;

  console.log('=== Patients matching Abdull?ai/Barrie/Barma ===');
  const barries = await db.collection('patients').find({
    $or: [
      { firstName: { $regex: /Abdull|abdul/i } },
      { lastName: { $regex: /Barrie|Barma/i } }
    ]
  }).toArray();
  console.log('Count:', barries.length);
  barries.forEach(p => console.log('  ', p.patientId, '|', p.firstName, p.lastName, '| age', p.age, p.ageUnit, '| phone', p.phone, '| addr', p.address, '| created', p.createdAt));

  console.log('\n=== In-consultation visits: doctorId types ===');
  const visits = await db.collection('visits').find({ status: 'in_consultation' }).toArray();
  const doctorIds = [...new Set(visits.map(v => v.doctorId?.toString()))];
  console.log('Distinct doctorIds on in_consultation visits:', doctorIds);

  console.log('\n=== All Doctor records ===');
  const doctors = await db.collection('doctors').find({}).toArray();
  doctors.forEach(d => console.log('  ', d._id.toString(), '|', d.fullName, '| profileId:', d.profileId, '| userId:', d.userId));

  console.log('\n=== Dr. Paul Carefam Profile ===');
  const paulProfile = await db.collection('profiles').findOne({ email: 'doctor@emr.test' });
  console.log('  Profile _id:', paulProfile?._id?.toString(), '| email:', paulProfile?.email);

  console.log('\n=== Status counts ===');
  const counts = await db.collection('visits').aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();
  console.log(counts);

  process.exit(0);
})();
