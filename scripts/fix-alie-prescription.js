const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const envFile = path.join(__dirname, '..', '.env.production');
const envText = fs.readFileSync(envFile, 'utf8');
const envLines = envText.split(/\r?\n/);
for (const line of envLines) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

async function nextIdSequence(db, key) {
  const seq = await db.collection('id_sequences').findOneAndUpdate(
    { _id: key },
    { $inc: { currentValue: 1 }, $setOnInsert: { _id: key, prefix: '', datePart: '' } },
    { upsert: true, returnDocument: 'after' },
  );
  return seq.currentValue;
}
function pad(n, w) { return String(n).padStart(w, '0'); }

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const alie = await db.collection('patients').findOne({ firstName: 'Alie', lastName: 'Abu Carter' });
  if (!alie) { console.log('Alie not found'); process.exit(0); }
  const visit = await db.collection('visits').findOne({ patientId: alie._id });
  if (!visit) { console.log('Alie visit not found'); process.exit(0); }

  // Check if a prescription already exists for this visit
  const existingRx = await db.collection('prescriptions').findOne({ visitId: visit._id });
  if (existingRx) { console.log('Alie prescription already exists'); process.exit(0); }

  const meds = 'Artesunate 625mg, Cipro 500mg, Metronidazole 400mg, Quinine, PCT 500mg, Ceftriaxone 2g, Cipro, PCT 250mg; notes: PCT 500mg, Inj Ampiclox, Inj PCT, Cannulation';
  const items = meds.split(/[;,]/).map(s => s.trim()).filter(Boolean);
  const defaultMed = await db.collection('medications').findOne({ name: 'Paracetamol' });
  const rxItems = items.map((name) => {
    const doseMatch = name.match(/(\d+\s*(?:mg|ml|mcg|g))/i);
    return {
      medicationId: defaultMed ? defaultMed._id : new mongoose.Types.ObjectId(),
      medicationName: name,
      dosage: doseMatch ? doseMatch[1] : '500mg',
      frequency: '3 times daily',
      duration: '5 days',
      quantity: 1,
      route: /inj|injection/i.test(name) ? 'IV' : 'oral',
    };
  });
  const visitDate = new Date('2026-06-03T00:00:00Z');
  const datePart = visitDate.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = await nextIdSequence(db, `prescription_number_${datePart}`);
  const prescriptionNumber = `RX-${datePart}-${pad(seq, 4)}`;

  await db.collection('prescriptions').insertOne({
    branchId: new mongoose.Types.ObjectId('6a18cecb719ac95c1ebade70'),
    prescriptionNumber,
    visitId: visit._id,
    patientId: alie._id,
    prescribedBy: new mongoose.Types.ObjectId('6a0082f2879b4e437682b52d'),
    doctorId: new mongoose.Types.ObjectId('6a0082f2879b4e437682b52d'),
    status: 'pending',
    items: rxItems,
    notes: meds,
    createdAt: visitDate,
    updatedAt: visitDate,
  });
  console.log(`Added prescription ${prescriptionNumber} for Alie (${alie.patientId})`);
  await mongoose.disconnect();
})();
