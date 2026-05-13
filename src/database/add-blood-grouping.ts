import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function addBloodGrouping() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('Adding Blood Grouping test to catalog...');

  // Check if Blood Grouping already exists
  const existingTest = await testCatalogModel.findOne({ code: 'BLOODGROUP' });
  if (existingTest) {
    console.log('Blood Grouping test already exists, updating...');
    await testCatalogModel.updateOne(
      { code: 'BLOODGROUP' },
      {
        name: 'Blood Grouping',
        category: 'hematology',
        price: 100,
        sampleType: 'blood',
        turnaroundTime: 30,
        isActive: true,
        description: 'ABO and Rh blood grouping',
        unit: 'blood group',
        referenceRanges: [
          {
            ageGroup: 'All Ages',
            ageMin: 0,
            gender: 'all',
            range: 'A+, A-, B+, B-, AB+, AB-, O+, O-',
            unit: 'blood group'
          }
        ]
      }
    );
    console.log('✅ Blood Grouping test updated successfully');
  } else {
    // Create new Blood Grouping test
    const bloodGroupingTest = new testCatalogModel({
      code: 'BLOODGROUP',
      name: 'Blood Grouping',
      category: 'hematology',
      price: 100,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'ABO and Rh blood grouping',
      unit: 'blood group',
      referenceRanges: [
        {
          ageGroup: 'All Ages',
          ageMin: 0,
          gender: 'all',
          range: 'A+, A-, B+, B-, AB+, AB-, O+, O-',
          unit: 'blood group'
        }
      ]
    });

    await bloodGroupingTest.save();
    console.log('✅ Blood Grouping test added successfully');
  }

  // Display the test details
  const savedTest = await testCatalogModel.findOne({ code: 'BLOODGROUP' });
  console.log('\n📋 Blood Grouping Test Details:');
  console.log(`Code: ${savedTest.code}`);
  console.log(`Name: ${savedTest.name}`);
  console.log(`Category: ${savedTest.category}`);
  console.log(`Price: Le ${savedTest.price}`);
  console.log(`Sample Type: ${savedTest.sampleType}`);
  console.log(`Turnaround Time: ${savedTest.turnaroundTime} minutes`);
  console.log(`Active: ${savedTest.isActive}`);
  console.log(`Description: ${savedTest.description}`);
  console.log('\n🩸 Possible Results:');
  console.log('  A+  |  A-  |  B+  |  B-  |  AB+  |  AB-  |  O+  |  O-');
  console.log('\n📄 Reporting:');
  console.log('  Results are reported as the blood group phenotype (e.g., A+).');
  console.log('  No numeric reference range — value is displayed directly on the report.');

  await app.close();
  console.log('\n✅ Script completed successfully');
}

addBloodGrouping().catch(console.error);
