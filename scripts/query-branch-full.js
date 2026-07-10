const { MongoClient, ObjectId } = require('mongodb');
const uri = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamemr?retryWrites=true&w=majority&appName=Cluster0';
const CC_ID = '6a18cecb719ac95c1ebade71';
const AT_ID = '6a18cecb719ac95c1ebade70';

async function run() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const db = client.db('carefaamemr');
    const atf = { branchId: new ObjectId(AT_ID) };
    const ccf = { branchId: new ObjectId(CC_ID) };

    const cols = ['patients','visits','orders','prescriptions','payments','medications','profiles','admissions','treatmentplans','soapnotes','labresults'];

    console.log('=== Allen Town counts ===');
    for (const c of cols) {
      const count = await db.collection(c).countDocuments(atf);
      if (count > 0) console.log(`  ${c}: ${count}`);
    }

    console.log('\n=== Congo Cross counts ===');
    let anyCC = false;
    for (const c of cols) {
      const count = await db.collection(c).countDocuments(ccf);
      if (count > 0) { console.log(`  ${c}: ${count}`); anyCC = true; }
    }
    if (!anyCC) console.log('  (none)');

    // Check for branchId across ALL documents in key collections
    console.log('\n=== branchId distribution (patients) ===');
    const pByBranch = await db.collection('patients').aggregate([{ $group: { _id: '$branchId', count: { $sum: 1 } } }]).toArray();
    pByBranch.forEach(b => console.log(`  ${b._id}: ${b.count}`));

    console.log('\n=== branchId distribution (visits) ===');
    const vByBranch = await db.collection('visits').aggregate([{ $group: { _id: '$branchId', count: { $sum: 1 } } }]).toArray();
    vByBranch.forEach(b => console.log(`  ${b._id}: ${b.count}`));

    console.log('\n=== branchId distribution (payments) ===');
    const payByBranch = await db.collection('payments').aggregate([{ $group: { _id: '$branchId', count: { $sum: 1 }, total: { $sum: '$amount' } } }]).toArray();
    payByBranch.forEach(b => console.log(`  ${b._id}: ${b.count} payments, Le ${(b.total||0).toLocaleString()}`));

    console.log('\n=== branchId distribution (profiles) ===');
    const prByBranch = await db.collection('profiles').aggregate([{ $group: { _id: '$branchId', count: { $sum: 1 } } }]).toArray();
    prByBranch.forEach(b => console.log(`  ${b._id || 'null'}: ${b.count}`));

    // Allen Town summary
    console.log('\n=== Allen Town — Visit Statuses ===');
    const atVisits = await db.collection('visits').aggregate([
      { $match: atf },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    atVisits.forEach(v => console.log(`  ${v._id}: ${v.count}`));

    console.log('\n=== Allen Town — Payment Methods ===');
    const atPays = await db.collection('payments').aggregate([
      { $match: atf },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ]).toArray();
    atPays.forEach(p => console.log(`  ${p._id}: ${p.count} payments, Le ${(p.total||0).toLocaleString()}`));

    console.log('\n=== Allen Town — Medications ===');
    const atMeds = await db.collection('medications').find(atf).toArray();
    atMeds.forEach(m => console.log(`  ${m.name} | Stock: ${m.stockQuantity||0} | Price: Le ${(m.unitPrice||0).toLocaleString()} | Category: ${m.category||'N/A'}`));

    console.log('\n=== Allen Town — Staff ===');
    const atProfs = await db.collection('profiles').find(atf).toArray();
    atProfs.forEach(p => console.log(`  ${p.fullName||p.email} | Roles: ${JSON.stringify(p.roles||[])} | Active: ${p.isActive!==false}`));

    // Check Allen Town prescriptions
    console.log('\n=== Allen Town — Prescriptions ===');
    const atRx = await db.collection('prescriptions').find(atf).toArray();
    atRx.forEach(r => console.log(`  ${r.prescriptionNumber} | Status: ${r.status} | Paid: ${r.isPaid} | Items: ${(r.items||[]).length} | Total: ${r.totalAmount||'N/A'}`));

    // Check Allen Town orders
    console.log('\n=== Allen Town — Orders ===');
    const atOrders = await db.collection('orders').find(atf).toArray();
    atOrders.forEach(o => {
      const tests = o.order_tests || o.tests || [];
      console.log(`  ${o.orderNumber || o._id} | Type: ${o.orderType||o.order_type||'N/A'} | Status: ${o.status} | Payment: ${o.paymentStatus||o.payment_status||'N/A'} | Tests: ${tests.length}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}
run();
