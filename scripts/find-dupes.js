const { MongoClient, ObjectId } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);

async function main() {
  const uri = await new Promise((resolve, reject) => {
    dns.resolveSrv('_mongodb._tcp.cluster0.abdi7yt.mongodb.net', (err, addresses) => {
      if (err) return reject(err);
      const hosts = addresses.map(a => `${a.name}:${a.port}`).join(',');
      resolve(`mongodb://${encodeURIComponent('mmmnigeriaschool12_db_user')}:${encodeURIComponent('Iamhardy_7*')}@${hosts}/carefaamemr?retryWrites=true&w=majority&appName=Cluster0&authSource=admin&tls=true`);
    });
  });

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 30000, tls: true });
  await client.connect();
  const db = client.db('carefaamemr');

  const result = await db.collection('patients').updateOne(
    { _id: new ObjectId('6a4fc2cb05301f7372b62560') },
    { $set: { firstName: 'Ibrahim', updatedAt: new Date() } }
  );
  console.log(`Updated ${result.modifiedCount} patient: Abrahim -> Ibrahim Kamara`);

  // Verify
  const patient = await db.collection('patients').findOne({ _id: new ObjectId('6a4fc2cb05301f7372b62560') });
  console.log(`Name: ${patient.firstName} ${patient.lastName}`);

  await client.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
