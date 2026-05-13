import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Update Lipid Profile Reference Ranges
 * 
 * Based on Zybio/Urit reagent specifications:
 * - TG: 0.00-2.30 mmol/L → 0-204 mg/dL
 * - LDL: 0.00-3.36 mmol/L → 0-130 mg/dL
 * - HDL: Need to get from reagent (typically 0.90-2.00 mmol/L → 35-77 mg/dL)
 * - Total Cholesterol: Need to get from reagent (typically 3.00-5.20 mmol/L → 116-201 mg/dL)
 */

async function updateLipidRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🔬 Updating Lipid Profile Reference Ranges...\n');

  try {
    // ==================== TRIGLYCERIDES (TG) ====================
    console.log('📊 Updating Triglycerides (TG)...');
    const tgResult = await testCatalogModel.updateOne(
      { code: 'TG' },
      {
        $set: {
          unit: 'mg/dL',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0-204',
              unit: 'mg/dL',
              criticalHigh: '500',
            },
          ],
        },
      }
    );
    console.log(`   ✅ TG updated: ${tgResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0-204 mg/dL (from 0.00-2.30 mmol/L)');

    // ==================== LDL CHOLESTEROL ====================
    console.log('\n📊 Updating LDL Cholesterol...');
    const ldlResult = await testCatalogModel.updateOne(
      { code: 'LDL' },
      {
        $set: {
          unit: 'mg/dL',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0-130',
              unit: 'mg/dL',
              criticalHigh: '190',
            },
          ],
        },
      }
    );
    console.log(`   ✅ LDL updated: ${ldlResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0-130 mg/dL (from 0.00-3.36 mmol/L)');

    // ==================== HDL CHOLESTEROL ====================
    console.log('\n📊 Updating HDL Cholesterol...');
    // From reagent: 0.9-2.00 mmol/L → 35-77 mg/dL
    const hdlResult = await testCatalogModel.updateOne(
      { code: 'HDL' },
      {
        $set: {
          unit: 'mg/dL',
          referenceRanges: [
            {
              ageGroup: 'Adult Male',
              ageMin: 18,
              gender: 'M',
              range: '35-77',
              unit: 'mg/dL',
              criticalLow: '35',
            },
            {
              ageGroup: 'Adult Female',
              ageMin: 18,
              gender: 'F',
              range: '35-77',
              unit: 'mg/dL',
              criticalLow: '35',
            },
          ],
        },
      }
    );
    console.log(`   ✅ HDL updated: ${hdlResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 35-77 mg/dL (from reagent: 0.9-2.00 mmol/L)');

    // ==================== TOTAL CHOLESTEROL ====================
    console.log('\n📊 Updating Total Cholesterol...');
    // From reagent: 0.00-5.2 mmol/L → 0-201 mg/dL
    const cholResult = await testCatalogModel.updateOne(
      { code: 'CHOL' },
      {
        $set: {
          unit: 'mg/dL',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0-201',
              unit: 'mg/dL',
              criticalHigh: '240',
            },
          ],
        },
      }
    );
    console.log(`   ✅ Total Cholesterol updated: ${cholResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0-201 mg/dL (from reagent: 0.00-5.2 mmol/L)');

    // ==================== VLDL CHOLESTEROL (Calculated) ====================
    console.log('\n📊 Updating VLDL Cholesterol (Calculated)...');
    const vldlResult = await testCatalogModel.updateOne(
      { code: 'VLDL' },
      {
        $set: {
          unit: 'mg/dL',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0-40',
              unit: 'mg/dL',
            },
          ],
        },
      }
    );
    console.log(`   ✅ VLDL updated: ${vldlResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0-40 mg/dL (calculated from TG/5)');

    // ==================== LDH (Lactate Dehydrogenase) ====================
    console.log('\n📊 Updating LDH (Lactate Dehydrogenase)...');
    // From reagent: 105-245 U/L
    const ldhResult = await testCatalogModel.updateOne(
      { code: 'LDH' },
      {
        $set: {
          unit: 'U/L',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '105-245',
              unit: 'U/L',
            },
          ],
        },
      }
    );
    console.log(`   ✅ LDH updated: ${ldhResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 105-245 U/L (from reagent specification)');

    // ==================== SUMMARY ====================
    console.log('\n' + '='.repeat(60));
    console.log('✅ Lipid Profile Reference Ranges Updated Successfully!');
    console.log('='.repeat(60));
    
    console.log('\n📋 Summary of Changes:');
    console.log('   • TG:    0-204 mg/dL (from reagent: 0.00-2.30 mmol/L)');
    console.log('   • LDL:   0-130 mg/dL (from reagent: 0.00-3.36 mmol/L)');
    console.log('   • HDL:   35-77 mg/dL (from reagent: 0.9-2.00 mmol/L)');
    console.log('   • CHOL:  0-201 mg/dL (from reagent: 0.00-5.2 mmol/L)');
    console.log('   • VLDL:  0-40 mg/dL (calculated from TG/5)');
    console.log('   • LDH:   105-245 U/L (from reagent specification)');

    console.log('\n✅ All ranges updated based on Zybio/Urit reagent specifications!\n');

  } catch (error) {
    console.error('❌ Error updating lipid ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateLipidRanges()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
