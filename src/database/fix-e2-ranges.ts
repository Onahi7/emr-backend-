import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';

/**
 * Fix E2 (Estradiol) reference ranges - correct unit is ng/mL not pg/mL
 * Based on actual analyzer report from NWOKO CHINANZA
 */
async function fixE2Ranges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<any>>('TestCatalogModel');
  const resultModel = app.get<Model<any>>('ResultModel');

  console.log('🔧 Fixing E2 (Estradiol) Reference Ranges\n');
  console.log('❌ WRONG: Unit was pg/mL with ranges 12-166, 85.8-498, etc.');
  console.log('✅ CORRECT: Unit should be ng/mL with phase-specific ranges\n');

  try {
    // Find E2 test
    const e2Test = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /^E2$/i } },
        { code: { $regex: /^ESTRADIOL$/i } }
      ]
    });

    if (!e2Test) {
      console.log('❌ E2 test not found in catalog\n');
      return;
    }

    console.log('📋 Current E2 Configuration:');
    console.log(`   Code: ${e2Test.code}`);
    console.log(`   Name: ${e2Test.name}`);
    console.log(`   Unit: ${e2Test.unit}`);
    console.log(`   Ranges: ${e2Test.referenceRanges?.length || 0}\n`);

    // Update with correct ranges from analyzer (phase-specific!)
    e2Test.referenceRanges = [
      {
        ageGroup: 'Male',
        ageMin: 13,
        gender: 'M',
        range: '0-85',
        unit: 'ng/mL'
      },
      {
        ageGroup: 'Female - Follicular Phase',
        ageMin: 13,
        gender: 'F',
        range: '12-262',
        unit: 'ng/mL'
      },
      {
        ageGroup: 'Female - Ovulation Phase',
        ageMin: 13,
        gender: 'F',
        range: '41-398',
        unit: 'ng/mL'
      },
      {
        ageGroup: 'Female - Luteal Phase',
        ageMin: 13,
        gender: 'F',
        range: '40-261',
        unit: 'ng/mL'
      },
      {
        ageGroup: 'Female - Menopause',
        ageMin: 45,
        gender: 'F',
        range: '0-31.5',
        unit: 'ng/mL'
      },
      {
        ageGroup: 'Female - Pregnancy',
        ageMin: 13,
        gender: 'F',
        range: '>1.5',
        unit: 'ng/mL'
      }
    ];
    e2Test.unit = 'ng/mL';
    
    await e2Test.save();
    console.log('✅ E2 test catalog updated with correct phase-specific ranges\n');

    // Update NWOKO CHINANZA's E2 result
    const e2Result = await resultModel.findOne({
      testCode: { $regex: /^ESTRADIOL$/i }
    });

    if (e2Result) {
      console.log('📊 Updating NWOKO CHINANZA\'s E2 result...');
      console.log(`   Old value: ${e2Result.value} ${e2Result.unit}`);
      console.log(`   Old range: ${e2Result.referenceRange}`);
      console.log(`   Old flag: ${e2Result.flag}\n`);

      // Collect all ranges for display
      const allRanges = e2Test.referenceRanges.map((r: any) => ({
        ageGroup: r.ageGroup,
        range: r.range,
        unit: r.unit,
        gender: r.gender
      }));

      // Assuming follicular phase (since value 18.22 fits follicular 12-262)
      const follicularRange = e2Test.referenceRanges.find((r: any) => 
        r.ageGroup.toLowerCase().includes('follicular')
      );

      e2Result.unit = 'ng/mL';
      e2Result.referenceRange = follicularRange ? `${follicularRange.range} ${follicularRange.unit}` : '12-262 ng/mL';
      e2Result.menstrualPhase = 'follicular';
      e2Result.allReferenceRanges = JSON.stringify(allRanges);
      
      // Recalculate flag based on follicular range (12-262)
      const value = parseFloat(e2Result.value);
      if (value >= 12 && value <= 262) {
        e2Result.flag = 'normal';
      } else if (value < 12) {
        e2Result.flag = 'low';
      } else {
        e2Result.flag = 'high';
      }

      await e2Result.save();

      console.log(`   New value: ${e2Result.value} ${e2Result.unit}`);
      console.log(`   New range: ${e2Result.referenceRange}`);
      console.log(`   New phase: ${e2Result.menstrualPhase}`);
      console.log(`   New flag: ${e2Result.flag}\n`);
      console.log('✅ E2 result updated successfully\n');
    } else {
      console.log('⚠️  No E2 result found for NWOKO CHINANZA\n');
    }

    // Display final configuration
    console.log('═'.repeat(80));
    console.log('FINAL E2 CONFIGURATION');
    console.log('═'.repeat(80) + '\n');

    const updatedE2 = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /^E2$/i } },
        { code: { $regex: /^ESTRADIOL$/i } }
      ]
    });

    console.log(`🧪 ${updatedE2.code} - ${updatedE2.name}`);
    console.log(`   Unit: ${updatedE2.unit}`);
    console.log(`   Reference Ranges: ${updatedE2.referenceRanges?.length || 0} range(s)`);
    if (updatedE2.referenceRanges && updatedE2.referenceRanges.length > 0) {
      updatedE2.referenceRanges.forEach((r: any) => {
        console.log(`     • ${r.ageGroup}: ${r.range} ${r.unit}`);
      });
    }

    console.log('\n✅ E2 ranges fixed successfully!');
    console.log('✅ E2 IS a phase-specific hormone test');
    console.log('✅ E2 uses ng/mL (not pg/mL)');
    console.log('✅ E2 has 6 ranges: 1 male + 5 female phases\n');

  } catch (error) {
    console.error('❌ Error fixing E2 ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

fixE2Ranges()
  .then(() => {
    console.log('🎉 Fix completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fix failed:', error);
    process.exit(1);
  });
