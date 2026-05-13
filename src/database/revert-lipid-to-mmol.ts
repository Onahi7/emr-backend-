import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Revert Lipid Profile to mmol/L (Original Reagent Units)
 * 
 * Using exact reagent specifications without conversion:
 * - TG: 0.00-2.30 mmol/L
 * - LDL: 0.00-3.36 mmol/L
 * - HDL: 0.9-2.00 mmol/L
 * - Total Cholesterol: 0.00-5.2 mmol/L
 * - LDH: 105-245 U/L (unchanged)
 */

async function revertToMmol() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🔬 Reverting Lipid Profile to mmol/L (Reagent Units)...\n');

  try {
    // ==================== TRIGLYCERIDES (TG) ====================
    console.log('📊 Updating Triglycerides (TG) to mmol/L...');
    const tgResult = await testCatalogModel.updateOne(
      { code: 'TG' },
      {
        $set: {
          unit: 'mmol/L',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0.00-2.30',
              unit: 'mmol/L',
            },
          ],
        },
      }
    );
    console.log(`   ✅ TG updated: ${tgResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0.00-2.30 mmol/L');

    // ==================== LDL CHOLESTEROL ====================
    console.log('\n📊 Updating LDL Cholesterol to mmol/L...');
    const ldlResult = await testCatalogModel.updateOne(
      { code: 'LDL' },
      {
        $set: {
          unit: 'mmol/L',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0.00-3.36',
              unit: 'mmol/L',
            },
          ],
        },
      }
    );
    console.log(`   ✅ LDL updated: ${ldlResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0.00-3.36 mmol/L');

    // ==================== HDL CHOLESTEROL ====================
    console.log('\n📊 Updating HDL Cholesterol to mmol/L...');
    const hdlResult = await testCatalogModel.updateOne(
      { code: 'HDL' },
      {
        $set: {
          unit: 'mmol/L',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0.9-2.00',
              unit: 'mmol/L',
            },
          ],
        },
      }
    );
    console.log(`   ✅ HDL updated: ${hdlResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0.9-2.00 mmol/L');

    // ==================== TOTAL CHOLESTEROL ====================
    console.log('\n📊 Updating Total Cholesterol to mmol/L...');
    const cholResult = await testCatalogModel.updateOne(
      { code: 'CHOL' },
      {
        $set: {
          unit: 'mmol/L',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0.00-5.2',
              unit: 'mmol/L',
            },
          ],
        },
      }
    );
    console.log(`   ✅ Total Cholesterol updated: ${cholResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0.00-5.2 mmol/L');

    // ==================== VLDL CHOLESTEROL (Calculated) ====================
    console.log('\n📊 Updating VLDL Cholesterol to mmol/L...');
    const vldlResult = await testCatalogModel.updateOne(
      { code: 'VLDL' },
      {
        $set: {
          unit: 'mmol/L',
          referenceRanges: [
            {
              ageGroup: 'Adult',
              ageMin: 18,
              gender: 'all',
              range: '0.00-0.45',
              unit: 'mmol/L',
            },
          ],
        },
      }
    );
    console.log(`   ✅ VLDL updated: ${vldlResult.modifiedCount} document(s)`);
    console.log('   📋 Range: 0.00-0.45 mmol/L (calculated from TG/2.2)');

    // ==================== LDH (Unchanged - already in U/L) ====================
    console.log('\n📊 LDH (Lactate Dehydrogenase) - No change needed');
    console.log('   📋 Range: 105-245 U/L (already correct)');

    // ==================== SUMMARY ====================
    console.log('\n' + '='.repeat(60));
    console.log('✅ Lipid Profile Reverted to mmol/L Successfully!');
    console.log('='.repeat(60));
    
    console.log('\n📋 Summary of Changes:');
    console.log('   • TG:    0.00-2.30 mmol/L');
    console.log('   • LDL:   0.00-3.36 mmol/L');
    console.log('   • HDL:   0.9-2.00 mmol/L');
    console.log('   • CHOL:  0.00-5.2 mmol/L');
    console.log('   • VLDL:  0.00-0.45 mmol/L (calculated)');
    console.log('   • LDH:   105-245 U/L (unchanged)');

    console.log('\n✅ All lipid tests now use mmol/L as per reagent specifications!\n');

  } catch (error) {
    console.error('❌ Error reverting to mmol/L:', error);
    throw error;
  } finally {
    await app.close();
  }
}

revertToMmol()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
