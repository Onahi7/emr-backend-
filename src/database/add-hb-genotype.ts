import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function addHbGenotype() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('Adding HB Genotype test to catalog...');

  // Check if HB Genotype already exists
  const existingTest = await testCatalogModel.findOne({ code: 'HBGENO' });
  if (existingTest) {
    console.log('HB Genotype test already exists, updating...');
    await testCatalogModel.updateOne(
      { code: 'HBGENO' },
      {
        name: 'HB Genotype',
        category: 'hematology',
        price: 100,
        sampleType: 'blood',
        turnaroundTime: 120,
        isActive: true,
        description: 'Hemoglobin genotype analysis for sickle cell screening. Results: AA (Normal), AS (Trait), SS (Sickle Cell Disease), SC (Sickling)',
        unit: 'genotype',
        referenceRanges: [
          {
            ageGroup: 'All Ages',
            ageMin: 0,
            gender: 'all',
            range: 'AA (Normal)',
            unit: 'genotype'
          }
        ]
      }
    );
    console.log('✅ HB Genotype test updated successfully');
  } else {
    // Create new HB Genotype test
    const hbGenotypeTest = new testCatalogModel({
      code: 'HBGENO',
      name: 'HB Genotype',
      category: 'hematology',
      price: 100,
      sampleType: 'blood',
      turnaroundTime: 120,
      isActive: true,
      description: 'Hemoglobin genotype analysis for sickle cell screening. Results: AA (Normal), AS (Trait), SS (Sickle Cell Disease), SC (Sickling)',
      unit: 'genotype',
      referenceRanges: [
        {
          ageGroup: 'All Ages',
          ageMin: 0,
          gender: 'all',
          range: 'AA (Normal)',
          unit: 'genotype'
        }
      ]
    });

    await hbGenotypeTest.save();
    console.log('✅ HB Genotype test added successfully');
  }

  // Display the test details
  const savedTest = await testCatalogModel.findOne({ code: 'HBGENO' });
  console.log('\n📋 HB Genotype Test Details:');
  console.log(`Code: ${savedTest.code}`);
  console.log(`Name: ${savedTest.name}`);
  console.log(`Category: ${savedTest.category}`);
  console.log(`Price: Le ${savedTest.price}`);
  console.log(`Sample Type: ${savedTest.sampleType}`);
  console.log(`Turnaround Time: ${savedTest.turnaroundTime} minutes`);
  console.log(`Active: ${savedTest.isActive}`);
  console.log(`Description: ${savedTest.description}`);
  console.log('\n🧬 Possible Results:');
  console.log('  AA: Normal - No sickle cell trait or disease');
  console.log('  AS: Trait - Sickle cell trait (carrier), usually asymptomatic');
  console.log('  SS: Sickle Cell Disease - Sickle cell anemia, requires medical management');
  console.log('  SC: Sickling - Hemoglobin SC disease, mild to moderate symptoms');

  await app.close();
  console.log('\n✅ Script completed successfully');
}

addHbGenotype().catch(console.error);