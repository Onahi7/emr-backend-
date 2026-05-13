import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function run() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI or DATABASE_URL must be set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;
  const users = await db.collection('users').find({}).toArray();

  console.log('All users:');
  users.forEach(u => console.log(JSON.stringify({ _id: u._id, username: u.username, email: u.email, full_name: u.full_name, fullName: u.fullName, name: u.name, roles: u.roles, role: u.role })));
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
