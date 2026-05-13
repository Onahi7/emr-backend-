import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function seedElectrolytes() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));
  const testPanelModel = app.get<Model<TestPanel>>(getModelToken(TestPanel.name));

  console.log('🔬 Seeding Electrolyte Tests and Panel...\n');

  try {
    // ==================== ELECTROLYTE TESTS ====================
    const electrolyteTests = [
      {
        code: 'K',
        name: 'Potassium',
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
            range: '3.5-5.2', 
            unit: 'mmol/L', 
            criticalLow: '2.5', 
            criticalHigh: '6.5' 
          },
        ],
      },
      {
        code: 'NA',
        name: 'Sodium',
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
            range: '136-145', 
            unit: 'mmol/L', 
            criticalLow: '120', 
            criticalHigh: '160' 
          },
        ],
      },
      {
        code: 'CL',
        name: 'Chloride',
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
            range: '96-108', 
            unit: 'mmol/L', 
            criticalLow: '80', 
            criticalHigh: '115' 
          },
        ],
      },
      {
        code: 'ICA',
        name: 'Ionized Calcium',
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
            range: '1.05-1.35', 
            unit: 'mmol/L', 
            criticalLow: '0.8', 
            criticalHigh: '1.5' 
          },
        ],
      },
      {
        code: 'NCA',
        name: 'Non-ionized Calcium',
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
            range: '1.05-1.35', 
            unit: 'mmol/L', 
            criticalLow: '0.8', 
            criticalHigh: '1.5' 
          },
        ],
      },
      {
        code: 'TCA',
        name: 'Total Calcium',
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
            range: '2.08-2.60', 
            unit: 'mmol/L', 
            criticalLow: '1.5', 
            criticalHigh: '3.0' 
          },
        ],
      },
      {
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
      {
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
    ];

    console.log('📋 Creating/Updating Electrolyte Tests:');
    for (const test of electrolyteTests) {
      const result = await testCatalogModel.updateOne(
        { code: test.code },
        { $set: test },
        { upsert: true }
      );
      
      if (result.upsertedCount > 0) {
        console.log(`   ✅ Created: ${test.code} - ${test.name}`);
      } else {
        console.log(`   ✅ Updated: ${test.code} - ${test.name}`);
      }
    }

    // ==================== ELECTROLYTE PANEL ====================
    console.log('\n📦 Creating Electrolyte Panel:');

    // Get all electrolyte test IDs (ordered as expected on panel)
    const testCodes = ['K', 'NA', 'CL', 'ICA', 'NCA', 'TCA', 'TCO2', 'PH'];
    const tests = await testCatalogModel.find({ code: { $in: testCodes } }).exec();

    // Preserve order from testCodes array
    const panelTests = testCodes
      .map(code => tests.find(t => t.code === code))
      .filter(Boolean)
      .map(test => ({
        testId: test!._id,
        testCode: test!.code,
        testName: test!.name,
      }));

    const panel = {
      code: 'ELEC',
      name: 'Electrolyte Panel',
      description: 'Complete electrolyte panel - K, Na, Cl, iCa, nCa, TCa, TCO2, Blood pH',
      price: 190,
      isActive: true,
      tests: panelTests,
    };

    const panelResult = await testPanelModel.updateOne(
      { code: 'ELEC' },
      { $set: panel },
      { upsert: true }
    );

    if (panelResult.upsertedCount > 0) {
      console.log(`   ✅ Created: ${panel.code} - ${panel.name}`);
    } else {
      console.log(`   ✅ Updated: ${panel.code} - ${panel.name}`);
    }
    console.log(`   Tests in panel: ${panelTests.map(t => t.testCode).join(', ')}`);
    console.log(`   Total price: ${panel.price}`);

    // ==================== VERIFICATION ====================
    console.log('\n🔍 Verification:');
    const savedPanel = await testPanelModel.findOne({ code: 'ELEC' }).exec();
    
    if (savedPanel) {
      console.log(`   ✅ Panel found in database`);
      console.log(`   Tests count: ${savedPanel.tests?.length || 0}`);
      
      if (savedPanel.tests && savedPanel.tests.length === 8) {
        console.log(`   ✅ All 8 tests present`);
      } else {
        console.log(`   ⚠️  Expected 8 tests, found ${savedPanel.tests?.length || 0}`);
      }
    } else {
      console.log(`   ❌ Panel not found in database`);
    }

    console.log('\n✅ Electrolyte seeding completed successfully!');
    console.log('\n💡 You can verify by running: node check-electrolyte-panel.js');

  } catch (error) {
    console.error('❌ Error seeding electrolytes:', error);
    throw error;
  } finally {
    await app.close();
  }
}

seedElectrolytes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
