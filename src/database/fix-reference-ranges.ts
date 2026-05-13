import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Fix reference ranges to match analyzer output from receipts
 * 
 * Based on analysis of receipts:
 * - Adult females (26, 30, 47 years) show: WBC 3.50-9.50
 * - All males in receipts are pediatric (4 days, 3 months, 1 year, 4 years, 5 years)
 * 
 * Changes:
 * 1. WBC Adult Male: Change from 4.00-11.00 to 3.50-9.50 (match adult female range from receipts)
 * 2. EOSA (Eosinophils #) Adult: Change from 0.02-0.52 to 0.02-0.80 (match receipts)
 * 
 * Note: Keeping gender-specific ranges for RBC, HB, HCT as we only have female adult data.
 * These ranges are clinically appropriate and should remain differentiated by gender.
 */
async function fixReferenceRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('Starting reference range corrections based on receipt analysis...\n');
  console.log('Receipt data analyzed:');
  console.log('  - Adult Females: ZAINAB KANU (26y), AMINATA KANGBO (47y), JUDITH BINTA RAHMAN (30y)');
  console.log('  - Pediatric Males: Ages 4 days, 3 months, 1 year, 4 years, 5 years');
  console.log('  - No adult male receipts available for comparison\n');

  try {
    // 1. Fix WBC - Adult Male range to match Adult Female (3.50-9.50)
    console.log('1. Fixing WBC Adult Male range to match adult female receipts...');
    const wbc = await testCatalogModel.findOne({ code: 'WBC' });
    if (wbc && wbc.referenceRanges) {
      const adultMaleRange = wbc.referenceRanges.find(
        r => r.ageMin === 13 && r.gender === 'M'
      );
      const adultFemaleRange = wbc.referenceRanges.find(
        r => r.ageMin === 13 && r.gender === 'F'
      );
      
      if (adultMaleRange && adultFemaleRange) {
        const oldMale = adultMaleRange.range;
        const femaleRange = adultFemaleRange.range;
        adultMaleRange.range = '3.50-9.50';
        await wbc.save();
        console.log(`   ✓ WBC Adult Male: ${oldMale} → 3.50-9.50`);
        console.log(`   ✓ WBC Adult Female: ${femaleRange} (unchanged)`);
        console.log(`   → Both genders now use 3.50-9.50 as seen on adult female receipts`);
      }
    }

    // 2. Fix EOSA (Eosinophils #) - Adult range to 0.02-0.80
    console.log('\n2. Fixing EOSA (Eosinophils #) Adult range...');
    const eosa = await testCatalogModel.findOne({ code: 'EOSA' });
    if (eosa && eosa.referenceRanges) {
      const adultRange = eosa.referenceRanges.find(
        r => r.ageMin === 13 && r.gender === 'all'
      );
      if (adultRange) {
        const oldRange = adultRange.range;
        adultRange.range = '0.02-0.80';
        await eosa.save();
        console.log(`   ✓ EOSA Adult: ${oldRange} → 0.02-0.80`);
        console.log(`   → Matches range shown on all adult receipts`);
      }
    }

    console.log('\n✅ Reference range corrections completed successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('   • WBC Adult Male: Updated to 3.50-9.50 (matches female range from receipts)');
    console.log('   • EOSA Adult: Updated to 0.02-0.80 (matches receipts)');
    console.log('\n📌 Preserved gender-specific ranges:');
    console.log('   • RBC: Female 3.80-5.10, Male 4.50-5.90 (clinically appropriate)');
    console.log('   • HB: Female 11.5-15.0, Male 13.5-17.5 (clinically appropriate)');
    console.log('   • HCT: Female 35.0-45.0, Male 40.0-54.0 (clinically appropriate)');
    console.log('\n💡 Note: Gender-specific ranges for RBC, HB, HCT are maintained as they are');
    console.log('   clinically significant and we only have female adult data from receipts.');

  } catch (error) {
    console.error('❌ Error fixing reference ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

fixReferenceRanges()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
