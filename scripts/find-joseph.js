// Development-only lookup helper. Do not put connection strings or credentials
// in source control; pass the database URI through the environment instead.
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Set MONGODB_URI before running this read-only lookup.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const patients = await mongoose.connection.collection('patients')
    .find({ $or: [{ firstName: /^joseph$/i }, { lastName: /^joseph$/i }] })
    .project({ patientId: 1, firstName: 1, lastName: 1, branchId: 1 })
    .toArray();
  console.log(patients);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
