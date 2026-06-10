/* eslint-disable no-console */
/**
 * One-time restore: re-create the 21 patients, visits, vitals,
 * prescriptions, and payments that were cleared by the
 * clear-test-data tool on 2026-06-05.
 *
 * Skips lab orders (the user said: "skip labs we will match that later").
 *
 * Status rule:
 *   - Dated before today (2026-06-05)  -> IN_CONSULTATION with Dr. Paul Carefam
 *   - Dated today                       -> AWAITING_TRIAGE
 *   - Undated                           -> IN_CONSULTATION (per user instruction)
 *
 * Run with:  node scripts/restore-patients-2026-06-05.js
 */
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
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI missing'); process.exit(1); }

// ── helpers ────────────────────────────────────────────────────────────────
const TODAY = new Date('2026-06-05T00:00:00Z');
const TODAY_END = new Date('2026-06-05T23:59:59Z');
const DEFAULT_BRANCH_ID = new mongoose.Types.ObjectId('6a18cecb719ac95c1ebade70'); // Harbour Medical Diagnostics Allen Town
const ADMIN_PROFILE_ID  = new mongoose.Types.ObjectId('6a00cb38a7b7fcbfb35fffe4'); // admin@lab.com
const NURSE_PROFILE_ID  = new mongoose.Types.ObjectId('6a0082f3879b4e437682b52e'); // nurse@emr.test (Nurse Amina)

const STATUS = {
  AWAITING_TRIAGE: 'awaiting_triage',
  IN_CONSULTATION: 'in_consultation',
};

function dobFromAge(ageValue, ageUnit) {
  if (ageValue == null) return undefined;
  const d = new Date(TODAY);
  if (ageUnit === 'years')      d.setFullYear(d.getFullYear() - ageValue);
  else if (ageUnit === 'months') d.setMonth(d.getMonth() - ageValue);
  else if (ageUnit === 'weeks')  d.setDate(d.getDate() - ageValue * 7);
  else if (ageUnit === 'days')   d.setDate(d.getDate() - ageValue);
  else                            d.setFullYear(d.getFullYear() - ageValue);
  return d;
}

function parseAge(ageStr) {
  if (!ageStr) return { value: null, unit: 'years' };
  const s = String(ageStr).toLowerCase().trim();
  if (s.includes('month')) {
    const m = s.match(/(\d+)/); return { value: m ? parseInt(m[1], 10) : null, unit: 'months' };
  }
  if (s.includes('week')) {
    const m = s.match(/(\d+)/); return { value: m ? parseInt(m[1], 10) : null, unit: 'weeks' };
  }
  if (s.includes('day')) {
    const m = s.match(/(\d+)/); return { value: m ? parseInt(m[1], 10) : null, unit: 'days' };
  }
  const m = s.match(/(\d+)/); return { value: m ? parseInt(m[1], 10) : null, unit: 'years' };
}

function parseBP(bpStr) {
  if (!bpStr) return undefined;
  const m = String(bpStr).match(/(\d{2,3})\s*[\/\\|]\s*(\d{2,3})/);
  return m ? `${m[1]}/${m[2]}` : undefined;
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

async function generatePatientId(db, date = TODAY) {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = await nextIdSequence(db, `patient_id_${datePart}`);
  return `PAT-${datePart}-${pad(seq, 4)}`;
}

async function generateVisitNumber(db, date = TODAY) {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = await nextIdSequence(db, `visit_number_${datePart}`);
  return `VIS-${datePart}-${pad(seq, 4)}`;
}

async function generatePrescriptionNumber(db, date = TODAY) {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = await nextIdSequence(db, `prescription_number_${datePart}`);
  return `RX-${datePart}-${pad(seq, 4)}`;
}

function parsePaymentDate(str) {
  if (!str) return TODAY;
  // Accept dd/mm/yyyy or yyyy-mm-dd
  const m1 = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const [, dd, mm, yyyy] = m1;
    const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
    return isNaN(d) ? TODAY : d;
  }
  const d = new Date(str);
  return isNaN(d) ? TODAY : d;
}

// ── source records (from the user's dump) ──────────────────────────────────
const RECORDS = [
  {
    n: 1, name: 'Abdulai Barma', ageStr: '6 yrs', sex: 'M', address: 'Faraway / Grafton', phone: '076 76 55 37',
    vitals: { weight: 18, temperature: 39.5, heartRate: 148, oxygenSaturation: 98 },
    diagnosis: 'MP: Positive, Typhoid: Negative, FBC, ESR, CRP, HB Genotype, Electrolyte',
    meds: 'PCT, Artesunate, Ceftriaxone, IVF',
    bill: { total: 580, paid: 580 },
  },
  {
    n: 2, name: 'Beatu Sowa', ageStr: '42 yrs', sex: 'F', address: '28 Freetown Old Road, Allentown', phone: '080 2847241',
    vitals: { bloodPressure: '142/85', heartRate: 144, temperature: 36.9, oxygenSaturation: 95, weight: 85 },
    diagnosis: 'FBC, ESR, FLP, HBA1c, Electrolytes',
    meds: '',
    bill: { total: 1000, paid: 1000 },
  },
  {
    n: 3, name: 'Dorahim Sattu', ageStr: '54 yrs', sex: 'M', address: 'Allentown', phone: '076 926 664',
    visitDate: '5/6/2026', // dd/mm/yyyy = today
    vitals: { bloodPressure: '160/109', heartRate: 78, temperature: 36.8, oxygenSaturation: 98, weight: 88 },
    diagnosis: '', meds: '', bill: { total: 0, paid: 0 },
  },
  {
    n: 4, name: 'Alie Abu Carter', ageStr: '46 yrs', sex: 'M', phone: '075 50 81 43',
    visitDate: '3/6/2026',
    vitals: { weight: 70, temperature: 37.1, oxygenSaturation: 98, bloodPressure: '118/79', heartRate: 134 },
    diagnosis: '', meds: 'Artesunate 625mg, Cipro 500mg, Metronidazole 400mg, Quinine, PCT 500mg, Ceftriaxone 2g, Cipro, PCT 250mg; notes: PCT 500mg, Inj Ampiclox, Inj PCT, Cannulation',
    bill: { total: 0, paid: 0 },
  },
  {
    n: 5, name: 'Victor Tommy Longoma', ageStr: '16 months', sex: 'M', phone: '030 85 38 55',
    visitDate: '3/6/2026',
    vitals: { weight: 6, oxygenSaturation: 97, heartRate: 132, temperature: 37.7 },
    diagnosis: 'FBC, ESR, MP, Urinalysis',
    meds: 'Ceftriaxone 480mg, Artesunate 18mg',
    bill: { total: 685, paid: 500 },
  },
  {
    n: 6, name: 'Fatmata Sanyha', ageStr: '', sex: '', address: '', phone: '',
    visitDate: '1/6/2026',
    diagnosis: 'HB test', meds: '', bill: { total: 50, paid: 50 },
  },
  {
    n: 7, name: 'Daniel Y. Quee', ageStr: '57 yrs', sex: '', address: 'Allentown Kiosk', phone: '034 900010',
    visitDate: '1/6/2026',
    diagnosis: 'Wound dressing',
    meds: 'Inj Diclofenac 75mg, Tabs Ibufen 1 card, Tabs Paracetamol, Tabs Vitamin C',
    bill: { total: 150, paid: 150 },
  },
  {
    n: 8, name: 'Naomi Jawana', ageStr: '23 yrs', sex: '', address: 'Yering Fanta New State', phone: '078 939 948',
    visitDate: '2/6/2026',
    vitals: { weight: 50, temperature: 37.0, oxygenSaturation: 99, bloodPressure: '117/73', heartRate: 97 },
    diagnosis: 'Malaria: Negative',
    meds: 'Artemether 80mg, Inj Artemether 250mg, Tabs Artesil, Azithromycin 500mg, Go Cold',
    bill: { total: 470, paid: 470 },
  },
  {
    n: 9, name: 'Mohamed F. Kawa', ageStr: '64 yrs', sex: '', address: 'Allentown', phone: '076 57 34 48',
    visitDate: '30/5/2026',
    vitals: { oxygenSaturation: 99, heartRate: 137, weight: 17, temperature: 37.8 }, // weight 17kg may be wrong, preserved as written
    diagnosis: '', meds: '', bill: { total: 435, paid: 435 },
  },
  {
    n: 10, name: 'Asalga', ageStr: '', sex: '', address: '', phone: '',
    visitDate: '30/5/2026',
    diagnosis: '', meds: '', bill: { total: 500, paid: 500 },
  },
  {
    n: 11, name: 'Maria Abdul P. Bangura', ageStr: '2 yrs', sex: '', address: 'Mayemie Garage, Old Road', phone: '040 231186',
    visitDate: '31/5/2026',
    vitals: { weight: 10, temperature: 36.2 },
    diagnosis: '', meds: 'RL 200ml, Cef 800mg, Artesunate 300mg',
    bill: { total: 400, paid: 400 },
  },
  {
    n: 12, name: 'Jonas Obi', ageStr: '45 yrs', sex: '', address: 'Allentown, Mayemie', phone: '',
    visitDate: '31/5/2026',
    diagnosis: 'FBC, RVS, TB', meds: '', bill: { total: 1000, paid: 1000 },
  },
  {
    n: 13, name: 'Rebecca Matthew', ageStr: '44 yrs', sex: 'F', address: 'Mayemie Barracks', phone: '033 497617',
    vitals: { bloodPressure: '131/85', heartRate: 103, oxygenSaturation: 96, weight: 55 },
    diagnosis: '', meds: '', bill: { total: 0, paid: 0 },
  },
  {
    n: 14, name: 'Olisa Igwe', ageStr: '', sex: 'M', address: '', phone: '',
    visitDate: '28/5/2026',
    vitals: { bloodPressure: '111/62', oxygenSaturation: 96, weight: 79, heartRate: 70 },
    diagnosis: '', meds: '', bill: { total: 0, paid: 0 },
  },
  {
    n: 15, name: 'Fatmata Saidu', ageStr: '53 yrs', sex: 'F', address: '', phone: '076 530 397',
    visitDate: '28/5/2026',
    vitals: { bloodPressure: '159/95', heartRate: null, temperature: null, oxygenSaturation: null }, // 28/5 159/95, also 29/5 158/93, 30/5 144/84 / 5.0 / 37.3 / 97%
    diagnosis: '', meds: '', bill: { total: 0, paid: 0 },
  },
  {
    n: 16, name: 'Unknown (Name not written)', ageStr: '', sex: 'M', address: '', phone: '',
    visitDate: '28/5/2026',
    vitals: { weight: 15, temperature: 38.8 },
    diagnosis: '', meds: '', bill: { total: 0, paid: 0 },
  },
  {
    n: 17, name: 'Obidiegwu Sunday', ageStr: '49 yrs', sex: 'M', address: '', phone: '076 783 940',
    visitDate: '27/5/2026',
    vitals: { bloodPressure: '127/89', heartRate: 64, weight: 84 },
    diagnosis: '', meds: '', bill: { total: 0, paid: 0 },
  },
  {
    n: 18, name: 'Gift Obidiegwu', ageStr: '42 yrs', sex: 'F', address: '', phone: '078 166 393',
    visitDate: '27/5/2026',
    vitals: { bloodPressure: '135/89', heartRate: 82, weight: 62 },
    diagnosis: 'Urinalysis: Glucose 50, Protein 30; Hormonal Profile: Prolactin, Estrogen, Testosterone, AMH, Progesterone, FSH; FLP, Electrolyte, Urea, Creatinine, LFT, RBC',
    meds: '', bill: { total: 0, paid: 0 },
  },
  {
    n: 19, name: 'Collins Ilse', ageStr: '43 yrs', sex: 'M', address: '', phone: '',
    visitDate: '25/5/2026',
    vitals: { bloodPressure: '142/101', heartRate: 70 },
    diagnosis: 'Urinalysis, Malaria, Typhoid; Malaria: Negative, Typhoid: Negative',
    meds: '', bill: { total: 720, paid: 720 },
  },
  {
    n: 20, name: 'Fatmata', ageStr: '53 yrs', sex: 'F', address: 'Alloh Town', phone: '076 530 397',
    visitDate: '25/5/2026',
    diagnosis: '', meds: 'Diclofenac 75mg, Massage',
    bill: { total: 0, paid: 0 },
  },
  {
    n: 21, name: 'Aminta Ahmad', ageStr: '34 yrs', sex: 'F', address: 'John Drive', phone: '072 452573',
    visitDate: '25/5/2026',
    vitals: { weight: 12, temperature: 37.8, oxygenSaturation: 98, heartRate: 160 },
    diagnosis: '', meds: 'PCT 180mg, Artesunate 36mg, Ampiclox 600mg',
    bill: { total: 350, paid: 170 },
  },
];

// ── main ───────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('Connected to MongoDB\n');

  // Make sure the doctor record exists for Dr. Paul Carefam
  let doctor = await db.collection('doctors').findOne({ fullName: 'Dr. Paul Carefam' });
  if (!doctor) {
    const ins = await db.collection('doctors').insertOne({
      fullName: 'Dr. Paul Carefam',
      phone: '',
      facility: 'Harbour Medical Diagnostics Allen Town',
      doctorType: 'general',
      specialty: 'general_practice',
      licenseNumber: '',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    doctor = { _id: ins.insertedId };
    console.log(`Created Doctor record: Dr. Paul Carefam (${doctor._id})`);
  } else {
    console.log(`Doctor exists: Dr. Paul Carefam (${doctor._id})`);
  }

  let patientsCreated = 0;
  let visitsCreated = 0;
  let consultationsCreated = 0;
  let prescriptionsCreated = 0;
  let paymentsCreated = 0;

  for (const rec of RECORDS) {
    const age = parseAge(rec.ageStr);
    const dob = dobFromAge(age.value, age.unit);
    const hasExplicitDate = !!rec.visitDate;
    const visitDate = hasExplicitDate ? parsePaymentDate(rec.visitDate) : TODAY;
    const isToday = hasExplicitDate && visitDate.getUTCFullYear() === TODAY.getUTCFullYear()
      && visitDate.getUTCMonth() === TODAY.getUTCMonth()
      && visitDate.getUTCDate() === TODAY.getUTCDate();

    // Per user: undated -> in_consultation, dated today -> triage, dated earlier -> consultation
    const status = hasExplicitDate && isToday ? STATUS.AWAITING_TRIAGE : STATUS.IN_CONSULTATION;
    const [firstName, ...rest] = rec.name.split(/\s+/);
    const lastName = rest.join(' ') || '-';

    // 1) Patient (idempotent: skip if a patient with this name + visitDate already exists)
    const existingPatient = await db.collection('patients').findOne({
      firstName,
      lastName,
      createdAt: visitDate,
    });
    let patientOid;
    if (existingPatient) {
      patientOid = existingPatient._id;
      console.log(`  #${rec.n}  ${rec.name.padEnd(28)}  SKIP (patient already exists)`);
      continue;
    }
    const patientId = await generatePatientId(db, visitDate);
    const patientDoc = {
      branchId: DEFAULT_BRANCH_ID,
      patientId,
      firstName,
      lastName,
      dateOfBirth: dob,
      age: age.value || 0,
      ageValue: age.value,
      ageUnit: age.unit,
      gender: rec.sex === 'M' ? 'M' : rec.sex === 'F' ? 'F' : 'O',
      phone: rec.phone || '000000000',
      address: rec.address || undefined,
      patientCategory: 'private',
      allergies: [],
      isActive: true,
      registeredBy: ADMIN_PROFILE_ID,
      createdAt: visitDate,
      updatedAt: visitDate,
    };
    const pIns = await db.collection('patients').insertOne(patientDoc);
    patientsCreated++;
    patientOid = pIns.insertedId;

    // 2) Visit
    const visitNumber = await generateVisitNumber(db, visitDate);
    const vitals = rec.vitals || {};
    const visitDoc = {
      branchId: DEFAULT_BRANCH_ID,
      visitNumber,
      patientId: patientOid,
      doctorId: status === STATUS.IN_CONSULTATION ? doctor._id : undefined,
      visitType: 'new',
      status,
      consultationPaid: status === STATUS.IN_CONSULTATION,
      chiefComplaint: rec.diagnosis || undefined,
      notes: rec.meds ? `Treatment: ${rec.meds}` : undefined,
      temperature: vitals.temperature,
      bloodPressure: parseBP(vitals.bloodPressure),
      heartRate: vitals.heartRate,
      oxygenSaturation: vitals.oxygenSaturation,
      weight: vitals.weight,
      rapidTestResults: [],
      triagedBy: vitals.heartRate || vitals.temperature || vitals.weight ? NURSE_PROFILE_ID : undefined,
      triagedAt: vitals.heartRate || vitals.temperature || vitals.weight ? visitDate : undefined,
      triagePriority: vitals.heartRate && vitals.heartRate > 130 ? 'urgent' : 'normal',
      consultationStartedAt: status === STATUS.IN_CONSULTATION ? visitDate : undefined,
      createdAt: visitDate,
      updatedAt: visitDate,
    };
    const vIns = await db.collection('visits').insertOne(visitDoc);
    visitsCreated++;
    const visitOid = vIns.insertedId;

    // 3) Consultation payment (for in_consultation records, or whenever paid > 0)
    if (rec.bill && rec.bill.paid > 0) {
      await db.collection('payments').insertOne({
        branchId: DEFAULT_BRANCH_ID,
        visitId: visitOid,
        patientId: patientOid,
        amount: rec.bill.paid,
        paymentType: 'consultation',
        paymentMethod: 'cash',
        status: 'completed',
        receivedBy: ADMIN_PROFILE_ID,
        createdAt: visitDate,
        updatedAt: visitDate,
      });
      paymentsCreated++;
    }

    // 4) Prescription (if meds were listed)
    if (rec.meds && rec.meds.trim()) {
      const items = rec.meds.split(/[;,]/).map(s => s.trim()).filter(Boolean);
      // Pick a default medication id (Paracetamol) for items that don't match a known med
      const defaultMed = await db.collection('medications').findOne({ name: 'Paracetamol' });
      const rxItems = items.map((name, idx) => {
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
      const prescriptionNumber = await generatePrescriptionNumber(db, visitDate);
      await db.collection('prescriptions').insertOne({
        branchId: DEFAULT_BRANCH_ID,
        prescriptionNumber,
        visitId: visitOid,
        patientId: patientOid,
        prescribedBy: doctor._id,
        doctorId: doctor._id,
        status: 'pending',
        items: rxItems,
        notes: rec.meds,
        createdAt: visitDate,
        updatedAt: visitDate,
      });
      prescriptionsCreated++;
    }

    console.log(`  #${rec.n}  ${rec.name.padEnd(28)}  status=${status.padEnd(20)}  visit=${visitNumber}`);
  }

  console.log('\n────────────────────────────────────────');
  console.log(`Patients created:       ${patientsCreated}`);
  console.log(`Visits created:         ${visitsCreated}`);
  console.log(`Prescriptions created:  ${prescriptionsCreated}`);
  console.log(`Payments created:       ${paymentsCreated}`);
  console.log('────────────────────────────────────────');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
