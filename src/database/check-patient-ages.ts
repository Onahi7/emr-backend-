import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { Patient } from './schemas/patient.schema';
import { Order } from './schemas/order.schema';

async function checkPatientAges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const patientModel = app.get<Model<Patient>>('PatientModel');
  const orderModel = app.get<Model<Order>>('OrderModel');

  console.log('🔍 Checking Patient Ages...\n');

  // Get a few recent patients
  const patients = await patientModel.find().sort({ createdAt: -1 }).limit(5).lean();

  console.log(`Found ${patients.length} recent patients:\n`);

  for (const patient of patients) {
    console.log('='.repeat(80));
    console.log(`Patient: ${patient.firstName} ${patient.lastName}`);
    console.log(`Patient ID: ${patient.patientId}`);
    console.log(`Age (stored): ${patient.age} years`);
    console.log(`Age Value: ${patient.ageValue || 'N/A'}`);
    console.log(`Age Unit: ${patient.ageUnit || 'N/A'}`);
    console.log(`Age Type: ${typeof patient.age}`);
    
    // Check if this patient has any orders
    const orderCount = await orderModel.countDocuments({ patientId: patient._id });
    console.log(`Orders: ${orderCount}`);
    console.log('');
  }

  // Check a specific 17-month-old if exists
  const seventeenMonthsInYears = 17 / 12; // 1.42 years
  const youngPatients = await patientModel.find({
    age: { $gte: 1, $lte: 2 }
  }).limit(3).lean();

  if (youngPatients.length > 0) {
    console.log('='.repeat(80));
    console.log('\n👶 Young Patients (1-2 years old):');
    for (const patient of youngPatients) {
      console.log(`\n   ${patient.firstName} ${patient.lastName}`);
      console.log(`   Age: ${patient.age} years`);
      console.log(`   Age Value: ${patient.ageValue || 'N/A'} ${patient.ageUnit || ''}`);
    }
  }

  await app.close();
  console.log('\n✅ Check completed');
}

checkPatientAges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error checking patient ages:', error);
    process.exit(1);
  });
