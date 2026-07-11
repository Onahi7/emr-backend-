const { MongoClient, ObjectId } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
const uri = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamemr?retryWrites=true&w=majority&appName=Cluster0';

(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('carefaamemr');
  
  // Find all recent visits
  const today = new Date('2026-07-11T00:00:00Z');
  const todayVisits = await db.collection('visits').find({ createdAt: { $gte: today } }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log('Today visits:');
  todayVisits.forEach(v => {
    console.log(' ', v.visitNumber, 'status:', v.status, 'branchId:', v.branchId, 'branchIdType:', typeof v.branchId, 'isObjectId:', ObjectId.isValid(v.branchId));
  });
  
  const count = await db.collection('visits').countDocuments();
  console.log('\nTotal visits in DB:', count);
  
  if (todayVisits.length > 0) {
    const testId = todayVisits[0]._id;
    console.log('\nTest visit:', todayVisits[0].visitNumber, '_id:', testId.toString());
    
    // Find by raw _id
    const r1 = await db.collection('visits').findOne({ _id: testId });
    console.log('1. Raw _id:', r1 ? 'FOUND' : 'NOT FOUND');
    
    // Find by string _id  
    const r2 = await db.collection('visits').findOne({ _id: testId.toString() });
    console.log('2. String _id:', r2 ? 'FOUND' : 'NOT FOUND');
    
    // Find by ObjectId _id only
    const r3 = await db.collection('visits').findOne({ _id: new ObjectId(testId.toString()) });
    console.log('3. ObjectId _id only:', r3 ? 'FOUND' : 'NOT FOUND');
    
    // Find by ObjectId _id + string branchId
    const branchStr = todayVisits[0].branchId ? todayVisits[0].branchId.toString() : null;
    console.log('   branchId string:', branchStr);
    const r4 = await db.collection('visits').findOne({ _id: new ObjectId(testId.toString()), branchId: branchStr });
    console.log('4. ObjectId _id + string branchId:', r4 ? 'FOUND' : 'NOT FOUND');
    
    // Find by ObjectId _id + ObjectId branchId  
    if (branchStr) {
      const r5 = await db.collection('visits').findOne({ _id: new ObjectId(testId.toString()), branchId: new ObjectId(branchStr) });
      console.log('5. ObjectId _id + ObjectId branchId:', r5 ? 'FOUND' : 'NOT FOUND');
    }
    
    // Find by ObjectId _id + no branchId
    const r6 = await db.collection('visits').findOne({ _id: new ObjectId(testId.toString()) });
    console.log('6. ObjectId _id only (no branchId):', r6 ? 'FOUND' : 'NOT FOUND');
  }
  
  await client.close();
})();
