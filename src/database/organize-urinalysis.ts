import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Organize Urinalysis Tests into Subcategories
 * 
 * Physical Examination: Color, Clarity
 * Dipstick/Chemical: pH, SG, Protein, Glucose, Ketones, Blood, Bilirubin, Urobilinogen, Nitrite, Leukocyte Esterase
 * Microscopic: RBC, WBC, Epithelial Cells, Casts, Crystals, Bacteria
 */

async function organizeUrinalysis() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🔬 Organizing Urinalysis Tests into Subcategories...\n');

  try {
    // ==================== PHYSICAL EXAMINATION ====================
    console.log('📊 Physical Examination:');
    const physicalTests = ['URINE-COLOR', 'URINE-CLARITY'];
    
    for (const code of physicalTests) {
      await testCatalogModel.updateOne(
        { code },
        { $set: { subcategory: 'Physical Examination' } }
      );
      console.log(`   ✅ ${code} → Physical Examination`);
    }

    // ==================== DIPSTICK/CHEMICAL ====================
    console.log('\n📊 Dipstick/Chemical:');
    const dipstickTests = [
      'URINE-PH',
      'URINE-SG',
      'URINE-PROTEIN',
      'URINE-GLUCOSE',
      'URINE-KETONES',
      'URINE-BLOOD',
      'URINE-BILI',
      'URINE-URO',
      'URINE-NITRITE',
      'URINE-LE',
    ];
    
    for (const code of dipstickTests) {
      await testCatalogModel.updateOne(
        { code },
        { $set: { subcategory: 'Dipstick/Chemical' } }
      );
      console.log(`   ✅ ${code} → Dipstick/Chemical`);
    }

    // ==================== MICROSCOPIC ====================
    console.log('\n📊 Microscopic:');
    const microscopicTests = [
      'URINE-RBC',
      'URINE-WBC',
      'URINE-EPI',
      'URINE-CASTS',
      'URINE-CRYSTALS',
      'URINE-BACTERIA',
    ];
    
    for (const code of microscopicTests) {
      await testCatalogModel.updateOne(
        { code },
        { $set: { subcategory: 'Microscopic' } }
      );
      console.log(`   ✅ ${code} → Microscopic`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Urinalysis Tests Organized Successfully!');
    console.log('='.repeat(60));
    
    console.log('\n📋 Summary:');
    console.log(`   Physical Examination: ${physicalTests.length} tests`);
    console.log(`   Dipstick/Chemical: ${dipstickTests.length} tests`);
    console.log(`   Microscopic: ${microscopicTests.length} tests`);
    console.log(`   Total: ${physicalTests.length + dipstickTests.length + microscopicTests.length} tests\n`);

  } catch (error) {
    console.error('❌ Error organizing urinalysis:', error);
    throw error;
  } finally {
    await app.close();
  }
}

organizeUrinalysis()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
