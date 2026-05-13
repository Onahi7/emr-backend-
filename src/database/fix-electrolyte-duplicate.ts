import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function fixElectrolyteDuplicate() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const testPanelModel = app.get<Model<TestPanel>>('TestPanelModel');

  console.log('🔧 Fixing Electrolyte Panel Duplicate...\n');

  // Check the panel (should exist with correct price)
  const panel = await testPanelModel.findOne({ code: 'ELEC' }).lean();
  
  if (panel) {
    console.log('✅ Panel exists in test_panels:');
    console.log(`   Code: ${panel.code}`);
    console.log(`   Name: ${panel.name}`);
    console.log(`   Price: Le ${panel.price}`);
    console.log(`   Tests: ${panel.tests?.length || 0} components\n`);
  } else {
    console.log('⚠️  No ELEC panel found in test_panels!\n');
  }

  // Remove ELEC from test catalog (panels shouldn't be in catalog)
  const catalogEntry = await testCatalogModel.findOne({ code: 'ELEC' }).lean();
  
  if (catalogEntry) {
    console.log('❌ Found duplicate ELEC entry in test_catalog:');
    console.log(`   Code: ${catalogEntry.code}`);
    console.log(`   Name: ${catalogEntry.name}`);
    console.log(`   Price: Le ${catalogEntry.price}`);
    console.log(`   Removing...\n`);
    
    await testCatalogModel.deleteOne({ code: 'ELEC' });
    console.log('✅ Removed ELEC from test_catalog\n');
  } else {
    console.log('✅ No ELEC entry in test_catalog (already clean)\n');
  }

  // Verify the fix
  console.log('='.repeat(80));
  console.log('\n🔍 Verification:');
  
  const panelCheck = await testPanelModel.findOne({ code: 'ELEC' }).lean();
  const catalogCheck = await testCatalogModel.findOne({ code: 'ELEC' }).lean();
  
  console.log(`   Panel in test_panels: ${panelCheck ? '✅ Yes (Le ' + panelCheck.price + ')' : '❌ No'}`);
  console.log(`   Entry in test_catalog: ${catalogCheck ? '❌ Yes (should not exist)' : '✅ No (correct)'}`);

  await app.close();
  console.log('\n✅ Fix completed');
}

fixElectrolyteDuplicate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error fixing electrolyte duplicate:', error);
    process.exit(1);
  });
