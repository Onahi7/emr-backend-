import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function updateRFTPanel() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));
  const testPanelModel = app.get<Model<TestPanel>>(getModelToken(TestPanel.name));

  console.log('🔧 Updating RFT Panel to include full Electrolyte Panel...\n');

  try {
    // ==================== UPDATE RFT PANEL ====================
    console.log('📋 Updating RFT Panel Structure:');
    console.log('   RFT will now include:');
    console.log('   - UREA (80)');
    console.log('   - CREAT (90)');
    console.log('   - Full Electrolyte Panel (210): K, NA, CL, ICA, NCA, TCA');
    console.log('   - HCO3 (35)');
    console.log('   - UA (80)');
    console.log('   Total: 495\n');
    
    // Get all required tests
    const rftTestCodes = ['UREA', 'CREAT', 'K', 'NA', 'CL', 'ICA', 'NCA', 'TCA', 'HCO3', 'UA'];
    const rftTestDocs = await testCatalogModel.find({ code: { $in: rftTestCodes } }).exec();
    
    console.log(`Found ${rftTestDocs.length}/${rftTestCodes.length} tests in catalog\n`);
    
    // Build test array with proper structure
    const rftPanelTests = [];
    
    // Add UREA
    const urea = rftTestDocs.find(t => t.code === 'UREA');
    if (urea) {
      rftPanelTests.push({
        testId: urea._id,
        testCode: urea.code,
        testName: urea.name,
      });
      console.log(`   ✅ UREA - ${urea.name}`);
    }
    
    // Add CREAT
    const creat = rftTestDocs.find(t => t.code === 'CREAT');
    if (creat) {
      rftPanelTests.push({
        testId: creat._id,
        testCode: creat.code,
        testName: creat.name,
      });
      console.log(`   ✅ CREAT - ${creat.name}`);
    }
    
    // Add Electrolyte tests (as a group)
    console.log('\n   📦 Electrolyte Panel (sub-panel):');
    const electrolyteCodes = ['K', 'NA', 'CL', 'ICA', 'NCA', 'TCA'];
    for (const code of electrolyteCodes) {
      const test = rftTestDocs.find(t => t.code === code);
      if (test) {
        rftPanelTests.push({
          testId: test._id,
          testCode: test.code,
          testName: test.name,
          subPanel: 'ELEC', // Mark as part of electrolyte sub-panel
          subPanelName: 'Electrolyte Panel',
        });
        console.log(`      ✅ ${code} - ${test.name}`);
      }
    }
    
    // Add HCO3
    const hco3 = rftTestDocs.find(t => t.code === 'HCO3');
    if (hco3) {
      rftPanelTests.push({
        testId: hco3._id,
        testCode: hco3.code,
        testName: hco3.name,
      });
      console.log(`\n   ✅ HCO3 - ${hco3.name}`);
    }
    
    // Add UA
    const ua = rftTestDocs.find(t => t.code === 'UA');
    if (ua) {
      rftPanelTests.push({
        testId: ua._id,
        testCode: ua.code,
        testName: ua.name,
      });
      console.log(`   ✅ UA - ${ua.name}`);
    }

    // Update RFT panel
    const rftPanel = {
      code: 'RFT',
      name: 'Renal Function Test',
      description: 'Comprehensive kidney function panel - Urea, Creatinine, Full Electrolytes (K, Na, Cl, iCa, nCa, TCa), Bicarbonate, Uric Acid',
      price: 495, // UREA(80) + CREAT(90) + ELEC(210) + HCO3(35) + UA(80)
      isActive: true,
      tests: rftPanelTests,
    };

    const result = await testPanelModel.updateOne(
      { code: 'RFT' },
      { $set: rftPanel },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      console.log(`\n   ✅ Created RFT Panel`);
    } else {
      console.log(`\n   ✅ Updated RFT Panel`);
    }
    
    console.log(`   Tests in panel: ${rftPanelTests.length}`);
    console.log(`   Total price: ${rftPanel.price}`);

    // ==================== VERIFICATION ====================
    console.log('\n🔍 Verification:');
    const savedPanel = await testPanelModel.findOne({ code: 'RFT' }).exec();
    
    if (savedPanel) {
      console.log(`   ✅ RFT Panel found in database`);
      console.log(`   Tests count: ${savedPanel.tests?.length || 0}`);
      console.log(`   Price: ${savedPanel.price}`);
      
      const electrolyteTests = savedPanel.tests?.filter((t: any) => t.subPanel === 'ELEC') || [];
      console.log(`   Electrolyte sub-panel tests: ${electrolyteTests.length}/6`);
      
      if (electrolyteTests.length === 6) {
        console.log(`   ✅ All 6 electrolyte tests included`);
      } else {
        console.log(`   ⚠️  Expected 6 electrolyte tests, found ${electrolyteTests.length}`);
      }
    } else {
      console.log(`   ❌ RFT Panel not found in database`);
    }

    console.log('\n✅ RFT Panel update completed successfully!');
    console.log('\n💡 Summary:');
    console.log('   - RFT now includes full Electrolyte panel (6 tests)');
    console.log('   - Total tests in RFT: 10 (UREA, CREAT, K, NA, CL, ICA, NCA, TCA, HCO3, UA)');
    console.log('   - Price updated: 495 (includes full electrolyte panel)');
    console.log('   - Electrolyte tests marked with subPanel: "ELEC" for UI grouping');

  } catch (error) {
    console.error('❌ Error updating RFT panel:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateRFTPanel()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
