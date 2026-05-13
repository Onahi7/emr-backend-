import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { Patient } from './schemas/patient.schema';
import { Result } from './schemas/result.schema';
import { TestCatalog } from './schemas/test-catalog.schema';

async function fixMadinatuUrineProtein() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const patientModel = app.get<Model<Patient>>('PatientModel');
  const resultModel = app.get<Model<Result>>('ResultModel');
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('🔧 Fixing Madinatu Barrie urine protein result...\n');

  // Step 1: Find the patient
  const patient = await patientModel.findOne({
    $or: [
      { firstName: { $regex: /madinatu/i }, lastName: { $regex: /barrie/i } },
      { fullName: { $regex: /madinatu.*barrie/i } }
    ]
  });

  if (!patient) {
    console.log('❌ Patient "Madinatu Barrie" not found');
    await app.close();
    return;
  }

  console.log(`✅ Found patient: ${patient.firstName} ${patient.lastName}`);
  console.log(`   Patient ID: ${patient._id}`);
  console.log(`   MRN: ${patient.mrn}\n`);

  // Step 2: Find urine protein results for this patient
  const urineProteinResults = await resultModel.find({
    patientId: patient._id,
    $or: [
      { testCode: 'URINE-PROTEIN' },
      { testCode: 'UPROTEIN' },
      { testCode: 'UPRO' },
      { testName: { $regex: /urine.*protein/i } }
    ]
  }).populate('orderId');

  console.log(`Found ${urineProteinResults.length} urine protein result(s):\n`);

  if (urineProteinResults.length === 0) {
    console.log('❌ No urine protein results found for this patient');
    await app.close();
    return;
  }

  // Step 3: First, ensure the test catalog is correct
  console.log('📋 Checking test catalog configuration...\n');
  
  const urineProteinTest = await testCatalogModel.findOne({ code: 'URINE-PROTEIN' });
  if (urineProteinTest) {
    console.log(`Test: ${urineProteinTest.code} - ${urineProteinTest.name}`);
    console.log(`  Current Category: ${urineProteinTest.category}`);
    console.log(`  Panel: ${urineProteinTest.panelCode || 'None'}`);
    
    const updates: any = {
      category: 'urinalysis',
      subcategory: 'Chemical',
      panelCode: 'URINE',
      panelName: 'Urinalysis'
    };
    
    await testCatalogModel.updateOne(
      { code: 'URINE-PROTEIN' },
      { $set: updates }
    );
    console.log(`  ✅ Updated test catalog configuration\n`);
  }

  // Step 4: Fix each result
  for (const result of urineProteinResults) {
    console.log(`📊 Result ID: ${result._id}`);
    console.log(`   Test Code: ${result.testCode}`);
    console.log(`   Test Name: ${result.testName}`);
    console.log(`   Value: ${result.value}`);
    console.log(`   Current Category: ${result.category || 'Not set'}`);
    console.log(`   Current Subcategory: ${result.subcategory || 'Not set'}`);
    console.log(`   Order ID: ${result.orderId}`);

    // Update the result to have correct category and subcategory
    const resultUpdates: any = {
      category: 'urinalysis',
      subcategory: 'Chemical'
    };

    await resultModel.updateOne(
      { _id: result._id },
      { $set: resultUpdates }
    );

    console.log(`   ✅ Updated result category to 'urinalysis' with subcategory 'Chemical'\n`);
  }

  // Step 5: Verify the changes
  console.log('📊 Verification - Updated Results:\n');
  const updatedResults = await resultModel.find({
    patientId: patient._id,
    $or: [
      { testCode: 'URINE-PROTEIN' },
      { testCode: 'UPROTEIN' },
      { testCode: 'UPRO' }
    ]
  });

  for (const result of updatedResults) {
    console.log(`Result: ${result.testCode} - ${result.testName}`);
    console.log(`  Value: ${result.value}`);
    console.log(`  Category: ${result.category}`);
    console.log(`  Subcategory: ${result.subcategory || 'None'}`);
    console.log(`  Resulted At: ${result.resultedAt}`);
    console.log('');
  }

  console.log('✅ Fix completed successfully!');
  console.log('\n📝 Next Steps:');
  console.log('   1. Regenerate the report for Madinatu Barrie');
  console.log('   2. Urine protein (Trace) should now appear under Urinalysis section');

  await app.close();
}

fixMadinatuUrineProtein().catch(console.error);