import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Display all FBC (Full Blood Count) related reference ranges
 */
async function showFBCRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                    FBC REFERENCE RANGES - CURRENT STATE');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  try {
    // FBC component test codes
    const fbcTests = [
      'WBC', 'NEUTA', 'LYMPHA', 'MONOA', 'EOSA', 'BASOA',
      'NEUT', 'LYMPH', 'MONO', 'EOS', 'BASO',
      'RBC', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC',
      'RDWCV', 'RDWSD', 'PLT', 'MPV', 'PDW', 'PLTCT', 'PLCR', 'PLCC'
    ];

    for (const code of fbcTests) {
      const test = await testCatalogModel.findOne({ code }).lean();
      
      if (!test) {
        console.log(`❌ ${code}: NOT FOUND IN DATABASE\n`);
        continue;
      }

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📊 ${code} - ${test.name}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Unit: ${test.unit || 'N/A'}`);
      console.log(`Active: ${test.isActive ? '✓ Yes' : '✗ No'}`);
      
      if (test.referenceRange) {
        console.log(`\n📌 Simple Range: ${test.referenceRange}`);
      }
      
      if (test.referenceRanges && test.referenceRanges.length > 0) {
        console.log(`\n📋 Age/Gender-Specific Ranges:\n`);
        
        test.referenceRanges.forEach((range: any, index: number) => {
          console.log(`   ${index + 1}. ${range.ageGroup || 'Unspecified Age'}`);
          console.log(`      Age: ${range.ageMin !== undefined ? `${range.ageMin}` : '0'}${range.ageMax !== undefined ? ` - ${range.ageMax}` : '+'} years`);
          console.log(`      Gender: ${range.gender || 'all'}`);
          console.log(`      Range: ${range.range} ${range.unit || test.unit || ''}`);
          
          if (range.condition) {
            console.log(`      Condition: ${range.condition}`);
          }
          if (range.pregnancy) {
            console.log(`      Pregnancy: Yes`);
          }
          if (range.criticalLow) {
            console.log(`      Critical Low: ${range.criticalLow}`);
          }
          if (range.criticalHigh) {
            console.log(`      Critical High: ${range.criticalHigh}`);
          }
          console.log('');
        });
      } else {
        console.log(`\n⚠️  No age/gender-specific ranges defined`);
      }
      
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('                              SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    // Count tests with ranges
    const testsWithRanges = await testCatalogModel.countDocuments({
      code: { $in: fbcTests },
      $or: [
        { referenceRange: { $exists: true, $ne: null } },
        { referenceRanges: { $exists: true, $ne: [], $not: { $size: 0 } } }
      ]
    });

    const testsWithoutRanges = fbcTests.length - testsWithRanges;

    console.log(`Total FBC Tests: ${fbcTests.length}`);
    console.log(`Tests with Reference Ranges: ${testsWithRanges}`);
    console.log(`Tests without Reference Ranges: ${testsWithoutRanges}`);
    
    // Show active vs inactive
    const activeTests = await testCatalogModel.countDocuments({
      code: { $in: fbcTests },
      isActive: true
    });
    
    console.log(`\nActive Tests: ${activeTests}`);
    console.log(`Inactive Tests: ${fbcTests.length - activeTests}`);

  } catch (error) {
    console.error('❌ Error displaying FBC ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

showFBCRanges()
  .then(() => {
    console.log('\n✅ Display completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Display failed:', error);
    process.exit(1);
  });
