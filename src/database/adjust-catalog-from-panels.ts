import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * This script adjusts the test catalog based on panel definitions
 * 
 * LOGIC:
 * 1. FBC Panel (150) - components NOT individually orderable (price: 0, isActive: false)
 * 2. LFT Panel (320) - components NOT individually orderable (price: 0, isActive: false)
 * 3. Electrolyte Panel (140) - components CAN be ordered individually (price: 35 each)
 * 4. RFT Panel (390) - components CAN be ordered individually (calculated from sum)
 * 5. Lipid Panel (660) - components CAN be ordered individually (calculated from sum)
 */

async function adjustCatalogFromPanels() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('Starting catalog adjustment based on panel definitions...\n');

  // ==================== FBC PANEL (150) - Components NOT individually orderable ====================
  const fbcComponents = ['HB', 'HCT', 'RBC', 'WBC', 'PLT', 'MCV', 'MCH', 'MCHC', 'RDW', 'NEUT', 'LYMPH', 'MONO', 'EOS', 'BASO'];
  
  console.log('📋 FBC Panel Components (NOT individually orderable):');
  for (const code of fbcComponents) {
    const result = await testCatalogModel.updateOne(
      { code },
      { 
        $set: { 
          price: 0, 
          isActive: false 
        } 
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✓ ${code}: price = 0, isActive = false`);
    }
  }

  // ==================== LFT PANEL (320) - Components NOT individually orderable ====================
  const lftComponents = ['ALT', 'AST', 'ALP', 'GGT', 'TBIL', 'DBIL', 'TP', 'ALB', 'GLOB'];
  
  console.log('\n📋 LFT Panel Components (NOT individually orderable):');
  for (const code of lftComponents) {
    const result = await testCatalogModel.updateOne(
      { code },
      { 
        $set: { 
          price: 0, 
          isActive: false 
        } 
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✓ ${code}: price = 0, isActive = false`);
    }
  }

  // ==================== ELECTROLYTE PANEL (140) - Components individually orderable ====================
  const electrolyteComponents = [
    { code: 'NA', price: 35 },
    { code: 'K', price: 35 },
    { code: 'CL', price: 35 },
    { code: 'HCO3', price: 35 }
  ];
  
  console.log('\n📋 Electrolyte Panel Components (individually orderable):');
  for (const test of electrolyteComponents) {
    const result = await testCatalogModel.updateOne(
      { code: test.code },
      { 
        $set: { 
          price: test.price, 
          isActive: true 
        } 
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✓ ${test.code}: price = ${test.price}, isActive = true`);
    }
  }
  console.log(`   Panel sum: ${electrolyteComponents.reduce((sum, t) => sum + t.price, 0)}`);

  // ==================== RFT PANEL (390) - Components individually orderable ====================
  const rftComponents = [
    { code: 'UREA', price: 80 },
    { code: 'CREAT', price: 90 },
    { code: 'NA', price: 35 },
    { code: 'K', price: 35 },
    { code: 'CL', price: 35 },
    { code: 'HCO3', price: 35 },
    { code: 'UA', price: 80 }
  ];
  
  console.log('\n📋 RFT Panel Components (individually orderable):');
  for (const test of rftComponents) {
    const result = await testCatalogModel.updateOne(
      { code: test.code },
      { 
        $set: { 
          price: test.price, 
          isActive: true 
        } 
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✓ ${test.code}: price = ${test.price}, isActive = true`);
    }
  }
  console.log(`   Panel sum: ${rftComponents.reduce((sum, t) => sum + t.price, 0)}`);

  // ==================== LIPID PANEL (660) - Components individually orderable ====================
  const lipidComponents = [
    { code: 'CHOL', price: 80 },
    { code: 'TG', price: 80 },
    { code: 'HDL', price: 120 },
    { code: 'LDL', price: 150 }
  ];
  
  console.log('\n📋 Lipid Panel Components (individually orderable):');
  for (const test of lipidComponents) {
    const result = await testCatalogModel.updateOne(
      { code: test.code },
      { 
        $set: { 
          price: test.price, 
          isActive: true 
        } 
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✓ ${test.code}: price = ${test.price}, isActive = true`);
    }
  }
  
  // VLDL is calculated (TG/5), not measured
  const vldlResult = await testCatalogModel.updateOne(
    { code: 'VLDL' },
    { 
      $set: { 
        price: 0, 
        isActive: false 
      } 
    }
  );
  if (vldlResult.modifiedCount > 0) {
    console.log(`   ✓ VLDL: price = 0, isActive = false (calculated field)`);
  }
  
  console.log(`   Panel sum (excluding calculated VLDL): ${lipidComponents.reduce((sum, t) => sum + t.price, 0)}`);

  // ==================== REMOVE PANEL ENTRIES FROM CATALOG ====================
  console.log('\n📋 Removing panel entries from catalog (they belong in test-panels only):');
  const panelCodes = ['FBC', 'LFT', 'RFT', 'LIPID', 'ELEC', 'URINE'];
  
  for (const code of panelCodes) {
    const result = await testCatalogModel.deleteOne({ code });
    if (result.deletedCount > 0) {
      console.log(`   ✓ Removed ${code} from catalog`);
    }
  }

  // ==================== URINALYSIS PANEL (90) - Components NOT individually orderable ====================
  const urineComponents = [
    'URINE-COLOR', 'URINE-CLARITY', 'URINE-PH', 'URINE-SG', 'URINE-PROTEIN',
    'URINE-GLUCOSE', 'URINE-KETONES', 'URINE-BLOOD', 'URINE-BILI', 'URINE-URO',
    'URINE-NITRITE', 'URINE-LE', 'URINE-RBC', 'URINE-WBC', 'URINE-EPI',
    'URINE-CASTS', 'URINE-CRYSTALS', 'URINE-BACTERIA'
  ];
  
  console.log('\n📋 Urinalysis Panel Components (NOT individually orderable):');
  for (const code of urineComponents) {
    const result = await testCatalogModel.updateOne(
      { code },
      { 
        $set: { 
          price: 0, 
          isActive: false 
        } 
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✓ ${code}: price = 0, isActive = false`);
    }
  }

  // ==================== SUMMARY ====================
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY:');
  console.log('='.repeat(60));
  
  const fbcCount = await testCatalogModel.countDocuments({ code: { $in: fbcComponents } });
  const lftCount = await testCatalogModel.countDocuments({ code: { $in: lftComponents } });
  const urineCount = await testCatalogModel.countDocuments({ code: { $in: urineComponents } });
  const activeTests = await testCatalogModel.countDocuments({ isActive: true });
  const inactiveTests = await testCatalogModel.countDocuments({ isActive: false });
  
  console.log(`✓ FBC components (inactive): ${fbcCount}`);
  console.log(`✓ LFT components (inactive): ${lftCount}`);
  console.log(`✓ Urinalysis components (inactive): ${urineCount}`);
  console.log(`✓ Active individual tests: ${activeTests}`);
  console.log(`✓ Inactive panel-only tests: ${inactiveTests}`);
  console.log('\n✅ Catalog adjustment completed successfully!');

  await app.close();
}

adjustCatalogFromPanels()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error adjusting catalog:', error);
    process.exit(1);
  });
