import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function updateElecPanel() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));
  const testPanelModel = app.get<Model<TestPanel>>(getModelToken(TestPanel.name));

  console.log('🔧 Updating Electrolyte Panel (adding TCO2 and Blood pH)...\n');

  try {
    // ==================== ENSURE TCO2 EXISTS IN CATALOG ====================
    const tco2Upsert = await testCatalogModel.updateOne(
      { code: 'TCO2' },
      {
        $setOnInsert: {
          code: 'TCO2',
          name: 'Total Carbon Dioxide',
          category: 'chemistry',
          price: 35,
          sampleType: 'blood',
          turnaroundTime: 120,
          isActive: true,
          unit: 'mmol/L',
          referenceRanges: [
            {
              ageGroup: 'All ages',
              ageMin: 0,
              gender: 'all',
              range: '22-28',
              unit: 'mmol/L',
              criticalLow: '15',
              criticalHigh: '40',
            },
          ],
        },
      },
      { upsert: true },
    );
    if (tco2Upsert.upsertedCount > 0) {
      console.log('   ✅ Created: TCO2 - Total Carbon Dioxide');
    } else {
      console.log('   ✅ Already exists: TCO2 - Total Carbon Dioxide');
    }

    // ==================== ENSURE PH (BLOOD pH) EXISTS IN CATALOG ====================
    const phUpsert = await testCatalogModel.updateOne(
      { code: 'PH' },
      {
        $setOnInsert: {
          code: 'PH',
          name: 'Blood pH',
          category: 'chemistry',
          price: 35,
          sampleType: 'blood',
          turnaroundTime: 120,
          isActive: true,
          unit: 'pH',
          referenceRanges: [
            {
              ageGroup: 'All ages',
              ageMin: 0,
              gender: 'all',
              range: '7.35-7.45',
              unit: 'pH',
              criticalLow: '7.20',
              criticalHigh: '7.60',
            },
          ],
        },
      },
      { upsert: true },
    );
    if (phUpsert.upsertedCount > 0) {
      console.log('   ✅ Created: PH - Blood pH');
    } else {
      console.log('   ✅ Already exists: PH - Blood pH');
    }

    // ==================== BUILD ELEC PANEL WITH ALL 8 TESTS ====================
    console.log('\n📋 Building Electrolyte Panel (K, Na, Cl, iCa, nCa, TCa, TCO2, Blood pH):');

    const electCodes = ['K', 'NA', 'CL', 'ICA', 'NCA', 'TCA', 'TCO2', 'PH'];
    const testDocs = await testCatalogModel.find({ code: { $in: electCodes } }).exec();

    const electPanelTests = [];

    for (const code of electCodes) {
      const test = testDocs.find(t => t.code === code);
      if (test) {
        electPanelTests.push({
          testId: test._id,
          testCode: test.code,
          testName: test.name,
        });
        console.log(`   ✅ ${code} - ${test.name}`);
      } else {
        console.warn(`   ⚠️  ${code} not found — skipping`);
      }
    }

    const electPanel = {
      code: 'ELEC',
      name: 'Electrolyte Panel',
      description: 'Complete electrolyte panel - K, Na, Cl, iCa, nCa, TCa, TCO2, Blood pH',
      price: 280,
      isActive: true,
      tests: electPanelTests,
    };

    const result = await testPanelModel.updateOne(
      { code: 'ELEC' },
      { $set: electPanel },
      { upsert: true },
    );

    if (result.upsertedCount > 0) {
      console.log('\n   ✅ Created ELEC Panel');
    } else {
      console.log('\n   ✅ Updated ELEC Panel');
    }

    console.log(`   Tests in panel: ${electPanelTests.length}`);
    console.log(`   Total price: ${electPanel.price}`);

    // ==================== VERIFICATION ====================
    console.log('\n🔍 Verification:');
    const savedPanel = await testPanelModel.findOne({ code: 'ELEC' }).exec();

    if (savedPanel) {
      console.log(`   ✅ ELEC Panel found in database`);
      console.log(`   Tests count: ${savedPanel.tests?.length || 0}/${electCodes.length}`);
      if ((savedPanel.tests?.length || 0) === electCodes.length) {
        console.log(`   ✅ All ${electCodes.length} tests present`);
      } else {
        console.log(`   ⚠️  Expected ${electCodes.length}, found ${savedPanel.tests?.length || 0}`);
      }
    } else {
      console.log('   ❌ ELEC Panel not found in database');
    }

    console.log('\n✅ Electrolyte panel update completed successfully!');
    console.log('\n💡 Summary:');
    console.log('   - ELEC panel now contains 8 tests: K, NA, CL, ICA, NCA, TCA, TCO2, PH');
    console.log('   - Price updated to 280 (8 tests × 35)');

  } catch (error) {
    console.error('❌ Error updating electrolyte panel:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateElecPanel()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
