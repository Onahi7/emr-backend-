const { MongoClient } = require('mongodb');
const dns = require('dns');

dns.setServers(['8.8.8.8']);
const SRV_HOST = '_mongodb._tcp.cluster0.abdi7yt.mongodb.net';
const DB_USER = 'mmmnigeriaschool12_db_user';
const DB_PASS = 'Iamhardy_7*';

async function buildUri() {
  return new Promise((resolve, reject) => {
    dns.resolveSrv(SRV_HOST, (err, addresses) => {
      if (err) return reject(err);
      const hosts = addresses.map(a => `${a.name}:${a.port}`).join(',');
      resolve(`mongodb://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@${hosts}/carefaamemr?retryWrites=true&w=majority&appName=Cluster0&authSource=admin&tls=true`);
    });
  });
}

(async () => {
  const uri = await buildUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('carefaamemr');

  const programs = await db.collection('insurance-programs').find({}).toArray();
  console.log('Insurance programs count:', programs.length);
  programs.forEach(p => console.log(`  ${p.code}: ${p.name} (${p._id})`));

  const subs = await db.collection('insurance-sub-entities').countDocuments();
  console.log('Sub-entities count:', subs);

  await client.close();
})();
