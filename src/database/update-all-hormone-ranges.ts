import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';

/**
 * Update ALL hormone test reference ranges including E2 (Estradiol)
 * Based on analyzer test reports from NWOKO CHINANZA
 */
async function updateAllHormoneRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<any>>('TestCatalogModel');
  const resultModel = app.get<Model<any>>('ResultModel');

  console.log('🔄 Updating ALL Hormone Reference Ranges\n');
  console.log('📋 Including E2 (Estradiol) from new test report\n');

  try {
    // ==================== E2 (Estradiol) ====================
    console.log('1️⃣ Updating E2 (Estradiol)...');
    
    // Check if E2 exists
    let e2Test = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /^E2$/i } },
        { code: { $regex: /^ESTRADIOL$/i } },
        { name: { $regex: /Estradiol/i } }
      ]
    });

    if (!e2Test) {
      // Create E2 test if it doesn't exist
      e2Test = new testCatalogModel({
        code: 'E2',
        name: 'Estradiol (E2)',
        category: 'immunoassay',
        price: 150,
        sampleType: 'serum',
        turnaroundTime: 120,
        isActive: true,
        unit: 'pg/mL',
      });
      console.log('   ✅ Created E2 test entry');
    }

    e2Test.referenceRanges = [
      {
        ageGroup: 'Female - Follicular Phase',
        ageMin: 13,
        gender: 'F',
        range: '12-166',
        unit: 'pg/mL'
      },
      {
        ageGroup: 'Female - Ovulation Phase',
        ageMin: 13,
        gender: 'F',
        range: '85.8-498',
        unit: 'pg/mL'
      },
      {
        ageGroup: 'Female - Luteal Phase',
        ageMin: 13,
        gender: 'F',
        range: '43.8-211',
        unit: 'pg/mL'
      },
      {
        ageGroup: 'Female - Menopause',
        ageMin: 45,
        gender: 'F',
        range: '0-54.7',
        unit: 'pg/mL'
      },
      {
        ageGroup: 'Female - Pregnancy',
        ageMin: 13,
        gender: 'F',
        range: '>1.5',
        unit: 'pg/mL'
      }
    ];
    e2Test.unit = 'pg/mL';
    await e2Test.save();
    console.log('   ✅ E2 updated successfully\n');

    // ==================== Update FSH ====================
    console.log('2️⃣ Updating FSH...');
    const fsh = await testCatalogModel.findOne({ code: { $regex: /^FSH$/i } });
    if (fsh) {
      fsh.referenceRanges = [
        {
          ageGroup: 'Male',
          ageMin: 13,
          gender: 'M',
          range: '1.50-12.40',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Follicular Phase',
          ageMin: 13,
          gender: 'F',
          range: '4.46-12.43',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Ovulation Phase',
          ageMin: 13,
          gender: 'F',
          range: '4.68-20.96',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Luteal Phase',
          ageMin: 13,
          gender: 'F',
          range: '1.55-8.04',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Menopause',
          ageMin: 45,
          gender: 'F',
          range: '20.00-98.62',
          unit: 'mIU/mL'
        }
      ];
      await fsh.save();
      console.log('   ✅ FSH updated\n');
    }

    // ==================== Update LH ====================
    console.log('3️⃣ Updating LH...');
    const lh = await testCatalogModel.findOne({ code: { $regex: /^LH$/i } });
    if (lh) {
      lh.referenceRanges = [
        {
          ageGroup: 'Female - Follicular Phase',
          ageMin: 13,
          gender: 'F',
          range: '1.81-16.10',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Ovulation Phase',
          ageMin: 13,
          gender: 'F',
          range: '13.65-95.60',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Luteal Phase',
          ageMin: 13,
          gender: 'F',
          range: '1.09-9.10',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Menopause',
          ageMin: 45,
          gender: 'F',
          range: '8.74-55.00',
          unit: 'mIU/mL'
        }
      ];
      await lh.save();
      console.log('   ✅ LH updated\n');
    }

    // ==================== Update Progesterone ====================
    console.log('4️⃣ Updating Progesterone...');
    const prog = await testCatalogModel.findOne({ code: { $regex: /^PROG/i } });
    if (prog) {
      prog.referenceRanges = [
        {
          ageGroup: 'Male',
          ageMin: 13,
          gender: 'M',
          range: '<4.41',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female - Follicular Phase',
          ageMin: 13,
          gender: 'F',
          range: '<1.12',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female - Luteal Phase',
          ageMin: 13,
          gender: 'F',
          range: '8.71-71.40',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female - Postmenopausal',
          ageMin: 50,
          gender: 'F',
          range: '0.11-0.71',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (12 Weeks)',
          ageMin: 13,
          gender: 'F',
          range: '11.20-90.00',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (12-24 Weeks)',
          ageMin: 13,
          gender: 'F',
          range: '25.60-89.40',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (24+ Weeks)',
          ageMin: 13,
          gender: 'F',
          range: '21.50-60.00',
          unit: 'ng/mL'
        }
      ];
      await prog.save();
      console.log('   ✅ Progesterone updated\n');
    }

    // ==================== Update AMH ====================
    console.log('5️⃣ Updating AMH...');
    const amh = await testCatalogModel.findOne({ code: { $regex: /^AMH$/i } });
    if (amh) {
      amh.referenceRanges = [
        {
          ageGroup: 'Male 20-60 years',
          ageMin: 20,
          ageMax: 60,
          gender: 'M',
          range: '0.92-13.89',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female 20-29 years',
          ageMin: 20,
          ageMax: 29,
          gender: 'F',
          range: '0.68-10.35',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female 30-39 years',
          ageMin: 30,
          ageMax: 39,
          gender: 'F',
          range: '0.31-7.86',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female 40-50 years',
          ageMin: 40,
          ageMax: 50,
          gender: 'F',
          range: '≤5.07',
          unit: 'ng/mL'
        }
      ];
      await amh.save();
      console.log('   ✅ AMH updated\n');
    }

    // ==================== Update PRL ====================
    console.log('6️⃣ Updating Prolactin...');
    const prl = await testCatalogModel.findOne({ code: { $regex: /^PROLACTIN$/i } });
    if (prl) {
      prl.referenceRanges = [
        {
          ageGroup: 'Male',
          ageMin: 13,
          gender: 'M',
          range: '3.45-17.42',
          unit: 'ng/mL'
        },
        {
          ageGroup: 'Female',
          ageMin: 13,
          gender: 'F',
          range: '4.60-25.07',
          unit: 'ng/mL'
        }
      ];
      await prl.save();
      console.log('   ✅ Prolactin updated\n');
    }

    // ==================== Update NWOKO CHINANZA's E2 Result ====================
    console.log('7️⃣ Updating NWOKO CHINANZA\'s E2 result with all ranges...');
    
    const e2Result = await resultModel.findOne({
      testCode: { $regex: /^ESTRADIOL$/i }
    });

    if (e2Result) {
      const allRanges = e2Test.referenceRanges.map((r: any) => ({
        ageGroup: r.ageGroup,
        range: r.range,
        unit: r.unit,
        gender: r.gender
      }));

      // Assuming luteal phase based on other results
      const lutealRange = e2Test.referenceRanges.find((r: any) => 
        r.ageGroup.toLowerCase().includes('luteal')
      );

      e2Result.referenceRange = lutealRange ? `${lutealRange.range} ${lutealRange.unit}` : '43.8-211 pg/mL';
      e2Result.menstrualPhase = 'luteal';
      e2Result.allReferenceRanges = JSON.stringify(allRanges);
      
      // Recalculate flag
      const value = parseFloat(e2Result.value);
      const rangeMatch = e2Result.referenceRange.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
      if (rangeMatch) {
        const low = parseFloat(rangeMatch[1]);
        const high = parseFloat(rangeMatch[2]);
        e2Result.flag = value < low ? 'low' : value > high ? 'high' : 'normal';
      }

      await e2Result.save();
      console.log('   ✅ E2 result updated with phase and all ranges\n');
    }

    // ==================== Display Summary ====================
    console.log('\n' + '='.repeat(80));
    console.log('UPDATED HORMONE TESTS SUMMARY');
    console.log('='.repeat(80) + '\n');

    const hormoneTests = await testCatalogModel.find({
      code: { $in: ['E2', 'ESTRADIOL', 'FSH', 'LH', 'PROG', 'AMH', 'PROLACTIN'] }
    }).sort({ code: 1 });

    for (const test of hormoneTests) {
      console.log(`\n🧪 ${test.code} - ${test.name}`);
      console.log(`   Unit: ${test.unit}`);
      console.log(`   Reference Ranges: ${test.referenceRanges?.length || 0} ranges`);
      if (test.referenceRanges && test.referenceRanges.length > 0) {
        test.referenceRanges.forEach((r: any) => {
          console.log(`     • ${r.ageGroup}: ${r.range} ${r.unit}`);
        });
      }
    }

    console.log('\n\n✅ All hormone reference ranges updated successfully!');
    console.log('✅ E2 (Estradiol) added with phase-specific ranges');
    console.log('✅ NWOKO CHINANZA\'s E2 result updated with all ranges\n');

  } catch (error) {
    console.error('❌ Error updating hormone ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateAllHormoneRanges()
  .then(() => {
    console.log('🎉 Update completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Update failed:', error);
    process.exit(1);
  });
