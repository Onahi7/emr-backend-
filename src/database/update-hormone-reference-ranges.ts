import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Update hormone reference ranges based on analyzer test reports
 * 
 * Based on test reports from NWOKO CHINANZA (Female, 32 years):
 * - FSH: Male 1.50-12.40, Female phases (Follicular 4.46-12.43, Ovulation 4.68-20.96, Luteal 1.55-8.04, Menopause 20.00-98.62) mIU/mL
 * - LH: Female phases (Follicular 1.81-16.10, Ovulation 13.65-95.60, Luteal 1.09-9.10, Menopause 8.74-55.00) mIU/mL
 * - Progesterone: Male <4.41, Female phases (Follicular <1.12, Luteal 8.71-71.40, Postmenopausal 0.11-0.71, Pregnancy ranges) ng/mL
 * - AMH: Male 20-60y (0.92-13.89), Female 20-29y (0.68-10.35), 30-39y (0.31-7.86), 40-50y (≤5.07) ng/mL
 * - PRL: Male 3.45-17.42, Female 4.60-25.07 ng/mL
 */
async function updateHormoneReferenceRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('🔄 Starting hormone reference ranges update...\n');
  console.log('📋 Based on test reports from: NWOKO CHINANZA (Female, 32 years)');
  console.log('📅 Test Date: 2026-04-21\n');

  try {
    // ==================== FSH (Follicle Stimulating Hormone) ====================
    console.log('1️⃣ Updating FSH (Follicle Stimulating Hormone)...');
    const fsh = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /FSH/i } },
        { name: { $regex: /FSH|Follicle Stimulating/i } }
      ]
    });
    
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
      fsh.unit = 'mIU/mL';
      await fsh.save();
      console.log('   ✅ FSH updated successfully');
    } else {
      console.log('   ⚠️ FSH test not found in catalog');
    }

    // ==================== LH (Luteinizing Hormone) ====================
    console.log('\n2️⃣ Updating LH (Luteinizing Hormone)...');
    const lh = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /^LH$/i } },
        { name: { $regex: /^LH$|Luteinizing/i } }
      ]
    });
    
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
      lh.unit = 'mIU/mL';
      await lh.save();
      console.log('   ✅ LH updated successfully');
    } else {
      console.log('   ⚠️ LH test not found in catalog');
    }

    // ==================== Progesterone ====================
    console.log('\n3️⃣ Updating Progesterone...');
    const prog = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /PROG/i } },
        { name: { $regex: /Progesterone/i } }
      ]
    });
    
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
      prog.unit = 'ng/mL';
      await prog.save();
      console.log('   ✅ Progesterone updated successfully');
    } else {
      console.log('   ⚠️ Progesterone test not found in catalog');
    }

    // ==================== AMH (Anti-Müllerian Hormone) ====================
    console.log('\n4️⃣ Updating AMH (Anti-Müllerian Hormone)...');
    const amh = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /AMH/i } },
        { name: { $regex: /AMH|Anti.*Mullerian/i } }
      ]
    });
    
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
      amh.unit = 'ng/mL';
      await amh.save();
      console.log('   ✅ AMH updated successfully');
    } else {
      console.log('   ⚠️ AMH test not found in catalog');
    }

    // ==================== BHCG (Beta-HCG) ====================
    console.log('\n5️⃣ Updating BHCG (Beta-HCG)...');
    const bhcg = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /BHCG/i } },
        { name: { $regex: /Beta.*HCG|Beta.*hCG/i } }
      ]
    });
    
    if (bhcg) {
      bhcg.referenceRanges = [
        {
          ageGroup: 'Male',
          ageMin: 18,
          gender: 'M',
          range: '0-5',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Non-pregnant',
          ageMin: 18,
          gender: 'F',
          range: '0-5',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (3 weeks)',
          ageMin: 18,
          gender: 'F',
          pregnancy: true,
          condition: '3 weeks',
          range: '5-50',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (4 weeks)',
          ageMin: 18,
          gender: 'F',
          pregnancy: true,
          condition: '4 weeks',
          range: '5-426',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (5 weeks)',
          ageMin: 18,
          gender: 'F',
          pregnancy: true,
          condition: '5 weeks',
          range: '18-7340',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (6 weeks)',
          ageMin: 18,
          gender: 'F',
          pregnancy: true,
          condition: '6 weeks',
          range: '1080-56500',
          unit: 'mIU/mL'
        },
        {
          ageGroup: 'Female - Pregnancy (7-8 weeks)',
          ageMin: 18,
          gender: 'F',
          pregnancy: true,
          condition: '7-8 weeks',
          range: '7650-229000',
          unit: 'mIU/mL'
        }
      ];
      bhcg.unit = 'mIU/mL';
      await bhcg.save();
      console.log('   ✅ BHCG updated successfully');
    } else {
      console.log('   ⚠️ BHCG test not found in catalog');
    }

    // ==================== PRL (Prolactin) ====================
    console.log('\n6️⃣ Updating PRL (Prolactin)...');
    const prl = await testCatalogModel.findOne({ 
      $or: [
        { code: { $regex: /PRL/i } },
        { name: { $regex: /Prolactin/i } }
      ]
    });
    
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
      prl.unit = 'ng/mL';
      await prl.save();
      console.log('   ✅ PRL updated successfully');
    } else {
      console.log('   ⚠️ PRL test not found in catalog');
    }

    // ==================== DISPLAY UPDATED TESTS ====================
    console.log('\n\n📊 ═══════════════════════════════════════════════════════════');
    console.log('📊 UPDATED HORMONE REFERENCE RANGES');
    console.log('📊 ═══════════════════════════════════════════════════════════\n');

    const hormoneTests = await testCatalogModel.find({
      $or: [
        { code: { $regex: /FSH|^LH$|PROG|AMH|BHCG|PRL/i } },
        { name: { $regex: /FSH|^LH$|Luteinizing|Progesterone|AMH|Mullerian|Beta.*HCG|Prolactin/i } }
      ]
    }).sort({ code: 1 });

    for (const test of hormoneTests) {
      console.log(`\n🧪 ${test.code} - ${test.name}`);
      console.log(`   Unit: ${test.unit}`);
      console.log('   Reference Ranges:');
      test.referenceRanges.forEach(range => {
        console.log(`     • ${range.ageGroup}: ${range.range} ${range.unit}`);
      });
    }

    console.log('\n\n✅ ═══════════════════════════════════════════════════════════');
    console.log('✅ All hormone reference ranges updated successfully!');
    console.log('✅ ═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error updating hormone reference ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateHormoneReferenceRanges()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
