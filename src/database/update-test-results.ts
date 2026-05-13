import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function updateTestResults() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('🔄 Updating test result options...');

  // ==================== UPDATE HB GENOTYPE RESULTS ====================
  console.log('\n📋 Updating HB Genotype test results...');
  
  const hbGenotypeTest = await testCatalogModel.findOne({ code: 'HBGENO' });
  if (hbGenotypeTest) {
    await testCatalogModel.updateOne(
      { code: 'HBGENO' },
      {
        description: 'Hemoglobin genotype analysis for sickle cell screening. Results: Positive, Negative, Non reactive, U',
        referenceRanges: [
          {
            ageGroup: 'All Ages',
            ageMin: 0,
            gender: 'all',
            range: 'Negative (Normal)',
            unit: 'qualitative'
          }
        ]
      }
    );
    console.log('✅ HB Genotype test updated with new result options');
    console.log('   Available results: Positive, Negative, Non reactive, U');
  } else {
    console.log('❌ HB Genotype test not found. Please run add-hb-genotype.ts first.');
  }

  // ==================== UPDATE URINE CLARITY OPTIONS ====================
  console.log('\n🧪 Updating Urine Clarity test options...');
  
  const urineClarity = await testCatalogModel.findOne({ code: 'URINE-CLARITY' });
  if (urineClarity) {
    await testCatalogModel.updateOne(
      { code: 'URINE-CLARITY' },
      {
        description: 'Physical examination - Clarity/Appearance. Options: Clear, Slightly cloudy, Cloudy, Turbid',
        referenceRanges: [
          {
            ageGroup: 'Normal',
            ageMin: 0,
            gender: 'all',
            range: 'Clear',
            unit: 'qualitative'
          }
        ]
      }
    );
    console.log('✅ Urine Clarity test updated with new options');
    console.log('   Available options: Clear, Slightly cloudy, Cloudy, Turbid');
  } else {
    console.log('❌ Urine Clarity test not found in catalog');
  }

  // ==================== DISPLAY UPDATED RESULTS ====================
  console.log('\n📊 Updated Test Details:');
  
  // Show HB Genotype details
  const updatedHbGenotype = await testCatalogModel.findOne({ code: 'HBGENO' });
  if (updatedHbGenotype) {
    console.log('\n🧬 HB Genotype Test:');
    console.log(`   Code: ${updatedHbGenotype.code}`);
    console.log(`   Name: ${updatedHbGenotype.name}`);
    console.log(`   Description: ${updatedHbGenotype.description}`);
    console.log('   Result Options:');
    console.log('     • Positive - Indicates presence of abnormal hemoglobin');
    console.log('     • Negative - Normal hemoglobin pattern');
    console.log('     • Non reactive - No reaction detected');
    console.log('     • U - Undetermined/Unclear result');
  }

  // Show Urine Clarity details
  const updatedUrineClarity = await testCatalogModel.findOne({ code: 'URINE-CLARITY' });
  if (updatedUrineClarity) {
    console.log('\n💧 Urine Clarity Test:');
    console.log(`   Code: ${updatedUrineClarity.code}`);
    console.log(`   Name: ${updatedUrineClarity.name}`);
    console.log(`   Description: ${updatedUrineClarity.description}`);
    console.log('   Clarity Options:');
    console.log('     • Clear - Normal, transparent appearance');
    console.log('     • Slightly cloudy - Mild turbidity');
    console.log('     • Cloudy - Moderate turbidity');
    console.log('     • Turbid - Heavy turbidity, opaque');
  }

  await app.close();
  console.log('\n✅ Test result options updated successfully');
}

updateTestResults().catch(console.error);