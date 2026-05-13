import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestPanel } from './schemas/test-panel.schema';
import { TestCatalog } from './schemas/test-catalog.schema';

async function checkElectrolytePanels() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const testPanelModel = app.get<Model<TestPanel>>('TestPanelModel');
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('🔍 Checking Electrolyte Panels...\n');

  // Find all electrolyte-related panels
  const panels = await testPanelModel.find({
    $or: [
      { code: 'ELEC' },
      { code: { $regex: /electrolyte/i } },
      { name: { $regex: /electrolyte/i } }
    ]
  }).lean();

  console.log(`Found ${panels.length} electrolyte panel(s):\n`);

  for (const panel of panels) {
    console.log('='.repeat(80));
    console.log(`Panel: ${panel.code} - ${panel.name}`);
    console.log(`Price: Le ${panel.price}`);
    console.log(`Active: ${panel.isActive ? 'Yes' : 'No'}`);
    console.log(`Tests: ${panel.tests?.length || 0}`);
    console.log(`ID: ${panel._id}`);
    
    if (panel.tests && panel.tests.length > 0) {
      console.log('\nComponent Tests:');
      panel.tests.forEach((test: any, idx: number) => {
        console.log(`   ${idx + 1}. ${test.testCode} - ${test.testName}`);
      });
    }
    console.log('');
  }

  // Also check test catalog for electrolyte entries
  const catalogElec = await testCatalogModel.find({
    $or: [
      { code: 'ELEC' },
      { code: { $regex: /^ELEC/i } },
      { name: { $regex: /electrolyte/i } }
    ]
  }).lean();

  if (catalogElec.length > 0) {
    console.log('='.repeat(80));
    console.log('\n📋 Electrolyte entries in Test Catalog:');
    catalogElec.forEach(test => {
      console.log(`   ${test.code} - ${test.name}`);
      console.log(`   Price: Le ${test.price} | Active: ${test.isActive ? 'Yes' : 'No'}`);
      console.log(`   ID: ${test._id}\n`);
    });
  }

  await app.close();
  console.log('✅ Check completed');
}

checkElectrolytePanels()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error checking electrolyte panels:', error);
    process.exit(1);
  });
