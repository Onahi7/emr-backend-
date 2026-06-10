const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGODB_URI);
  const db = m.connection.db;

  const now = new Date();
  const patientId = 'PAT-20260605-0005';
  const patientObjectId = new m.Types.ObjectId('6a22e4b586cf12d8f12b386a');
  const visitObjectId = new m.Types.ObjectId('6a22e4b686cf12d8f12b386b');
  const paulProfileId = new m.Types.ObjectId('6a0082f2879b4e437682b52d');
  const artesunate60Id = new m.Types.ObjectId('6a22ccf1308094ac8b795320');
  const branchId = new m.Types.ObjectId('6a18cecb719ac95c1ebade70');
  const nurseId = (await db.collection('profiles').findOne({ email: 'nurse@emr.test' }))?._id;
  const receptionId = (await db.collection('profiles').findOne({ email: 'reception@emr.test' }))?._id;

  console.log('=== 1. Rename patient Abdulai Barma -> Abdullahi Barrie ===');
  const r1 = await db.collection('patients').updateOne(
    { _id: patientObjectId },
    { $set: { firstName: 'Abdullahi', lastName: 'Barrie', updatedAt: now } }
  );
  console.log('Patient rename:', r1.matchedCount, 'modified:', r1.modifiedCount);

  console.log('\n=== 2. Add vitals, triage, rapid test results to visit ===');
  const triageVitals = {
    bloodPressure: '95/60',
    temperature: 37.2,
    heartRate: 100,
    respiratoryRate: 22,
    spO2: 98,
    weight: 20,
    height: 115,
    painScale: 2,
    recordedAt: now,
  };
  const rapidTestResults = [
    {
      testType: 'malaria',
      result: 'positive',
      antigen: 'p.f',
      parasiteCount: 5000,
      parasiteCountUnit: 'parasites/µL',
      severity: 'moderate',
      notes: 'Moderate parasitemia. Initiated Artesunate per WHO pediatric protocol.',
      performedBy: nurseId,
      performedAt: now,
    },
    {
      testType: 'typhoid',
      result: 'negative',
      antigen: 'IgG',
      notes: 'Typhoid RDT negative. Clinical picture consistent with malaria.',
      performedBy: nurseId,
      performedAt: now,
    },
  ];

  const r2 = await db.collection('visits').updateOne(
    { _id: visitObjectId },
    {
      $set: {
        vitals: triageVitals,
        triageNotes: 'Pediatric patient, age 6, presenting with fever, chills, and body aches for 3 days. No known drug allergies. Guardian: parent.',
        triageAlert: 'Malaria positive - Artesunate treatment initiated per pediatric protocol',
        triageAlerts: ['malaria_positive', 'pediatric'],
        rapidTestResults: rapidTestResults,
        chiefComplaint: 'Fever, chills, body aches x 3 days',
        historyOfPresentIllness: 'Caregiver reports child developed fever 3 days ago, associated with intermittent chills and generalized body aches. No vomiting, no diarrhea, no rash. Appetite reduced. Last meal yesterday evening.',
        examinationNotes: 'Temp 37.2°C, HR 100, BP 95/60, SpO2 98%. Child alert, no pallor, no jaundice. Throat clear. Lungs clear. Abdomen soft, non-tender.',
        assessment: '1. Malaria (P. falciparum) - confirmed by RDT, moderate parasitemia\n2. Rule out typhoid (RDT negative)',
        treatmentPlan: '1. Artesunate 60mg PO - first dose given, then 24h and 48h\n2. Paracetamol 500mg PO q6h PRN for fever\n3. Encourage oral fluids\n4. FBC + malaria parasite count to confirm clearance on day 3\n5. Review in 48 hours or sooner if symptoms worsen',
        doctorNotes: 'Reclassified as active consultation. RDT positive for P. falciparum. Artesunate course started. Caregiver counseled on warning signs (vomiting, lethargy, fits, persistent fever).',
        status: 'in_consultation',
        consultationStartedAt: now,
        triagedAt: now,
        updatedAt: now,
        createdAt: now,
      },
    }
  );
  console.log('Visit update:', r2.matchedCount, 'modified:', r2.modifiedCount);

  console.log('\n=== 3. Create Artesunate prescription ===');
  const today = '20260605';
  const prescriptionId = '6a0082f2879b4e437682b52d' + Math.random().toString(36).slice(2, 8);
  const prescriptionNumber = await db.collection('id_sequences').findOneAndUpdate(
    { _id: `prescription_number_${today}` },
    { $inc: { currentValue: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const rxNumber = `RX-${today}-${String(prescriptionNumber.currentValue).padStart(4, '0')}`;
  console.log('Prescription number:', rxNumber);

  const prescription = {
    prescriptionNumber: rxNumber,
    patientId: patientObjectId,
    visitId: visitObjectId,
    doctorId: paulProfileId,
    branchId: branchId,
    items: [
      {
        medicationId: artesunate60Id,
        medicationName: 'Artesunate [60]',
        dosage: '60mg (1 tablet)',
        frequency: 'Once daily x 3 days',
        duration: '3 days',
        quantity: 3,
        instructions: 'Give with food. Complete full course.',
      },
    ],
    status: 'dispensed',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    paidAmount: 0,
    notes: 'WHO pediatric protocol for uncomplicated P. falciparum malaria. First dose administered in clinic.',
    createdBy: paulProfileId,
    dispensedBy: nurseId,
    dispensedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const r3 = await db.collection('prescriptions').insertOne(prescription);
  console.log('Prescription created:', r3.insertedId.toString(), '|', rxNumber);

  console.log('\n=== 4. Mark first dose as administered (MAR) ===');
  const marEntry = {
    visitId: visitObjectId,
    patientId: patientObjectId,
    prescriptionId: r3.insertedId,
    medicationId: artesunate60Id,
    medicationName: 'Artesunate [60]',
    dosage: '60mg (1 tablet)',
    route: 'oral',
    scheduledFor: now,
    performedAt: now,
    performedBy: nurseId,
    refused: false,
    notes: 'First dose given in clinic. Tolerated well.',
    createdAt: now,
    updatedAt: now,
  };
  const r4 = await db.collection('medicationadministrations').insertOne(marEntry);
  console.log('MAR entry:', r4.insertedId.toString());

  console.log('\n=== 5. Mark rapid test orders complete ===');
  const orderDocs = [
    {
      orderNumber: 'ORD-20260605-0001',
      patientId: patientObjectId,
      visitId: visitObjectId,
      doctorId: paulProfileId,
      branchId: branchId,
      testId: 'MALARIA_RDT',
      testName: 'Malaria Rapid Diagnostic Test',
      priority: 'stat',
      status: 'completed',
      source: 'emr-internal',
      result: 'positive',
      resultNotes: 'P. falciparum positive. Parasite count 5000/µL (moderate).',
      performedBy: nurseId,
      resultedAt: now,
      paid: true,
      paymentMethod: 'cash',
      createdAt: now,
      updatedAt: now,
    },
    {
      orderNumber: 'ORD-20260605-0002',
      patientId: patientObjectId,
      visitId: visitObjectId,
      doctorId: paulProfileId,
      branchId: branchId,
      testId: 'TYPHOID_RDT',
      testName: 'Typhoid Rapid Diagnostic Test',
      priority: 'stat',
      status: 'completed',
      source: 'emr-internal',
      result: 'negative',
      resultNotes: 'Typhoid RDT negative.',
      performedBy: nurseId,
      resultedAt: now,
      paid: true,
      paymentMethod: 'cash',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const r5 = await db.collection('orders').insertMany(orderDocs);
  console.log('Orders created:', Object.keys(r5.insertedIds).length);

  console.log('\n=== 6. Add payments for the two rapid tests ===');
  const pay1 = {
    paymentNumber: 'PAY-20260605-0001',
    patientId: patientObjectId,
    visitId: visitObjectId,
    branchId: branchId,
    type: 'lab',
    items: [{ description: 'Malaria RDT', amount: 50 }],
    totalAmount: 50,
    method: 'cash',
    status: 'paid',
    receivedBy: receptionId,
    createdAt: now,
    updatedAt: now,
  };
  const pay2 = {
    paymentNumber: 'PAY-20260605-0002',
    patientId: patientObjectId,
    visitId: visitObjectId,
    branchId: branchId,
    type: 'lab',
    items: [{ description: 'Typhoid RDT', amount: 50 }],
    totalAmount: 50,
    method: 'cash',
    status: 'paid',
    receivedBy: receptionId,
    createdAt: now,
    updatedAt: now,
  };
  const r6 = await db.collection('payments').insertMany([pay1, pay2]);
  console.log('Payments created:', r6.insertedIds);

  console.log('\n=== VERIFY ===');
  const updated = await db.collection('patients').findOne({ _id: patientObjectId });
  console.log('Patient:', updated.firstName, updated.lastName, '| PAT-ID:', updated.patientId);
  const updatedVisit = await db.collection('visits').findOne({ _id: visitObjectId });
  console.log('Visit status:', updatedVisit.status, '| chiefComplaint:', updatedVisit.chiefComplaint);
  console.log('Vitals:', JSON.stringify(updatedVisit.vitals));
  console.log('Rapid test results:', updatedVisit.rapidTestResults.length, 'entries');
  console.log('Triage alert:', updatedVisit.triageAlert);
  console.log('updatedAt:', updatedVisit.updatedAt.toISOString());

  process.exit(0);
})();
