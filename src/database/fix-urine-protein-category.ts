import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function fixUrineProteinCategory() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('🔧 Fixing Urine Protein test configuration...\n');

  // Find all urine protein related tests
  const urineProteinTests = await testCatalogModel.find({
    $or: [
      { code: 'UPROTEIN' },
      { code: 'URINE-PROTEIN' },
      { code: 'UPRO' },
      { name: { $regex: /urine.*protein/i } }
    ]
  });

  console.log(`Found ${urineProteinTests.length} urine protein test(s):\n`);

  for (const test of urineProteinTests) {
    console.log(`📋 Test: ${test.code} - ${test.name}`);
    console.log(`   Current Category: ${test.category}`);
    console.log(`   Active: ${test.isActive}`);
    console.log(`   Price: Le ${test.price}`);
    console.log(`   Panel: ${test.panelCode || 'None'}`);
    
    // Handle URINE-PROTEIN (dipstick - part of urinalysis panel)
    if (test.code === 'URINE-PROTEIN') {
      console.log(`   ℹ️  This is a panel component (dipstick test)`);
      
      const updates: any = {
        category: 'urinalysis',
        subcategory: 'Chemical',
        panelCode: 'URINE',
        panelName: 'Urinalysis',
        isActive: false,  // Should NOT be orderable separately
        price: 0          // No separate price
      };
      
      await testCatalogModel.updateOne({ _id: test._id }, { $set: updates });
      console.log(`   ✅ Configured as urinalysis panel component (not separately orderable)`);
    }
    // Handle UPROTEIN (standalone quantitative test)
    else if (test.code === 'UPROTEIN') {
      console.log(`   ℹ️  This is a standalone quantitative test (24h collection)`);
      
      if (test.category !== 'urinalysis') {
        await testCatalogModel.updateOne(
          { _id: test._id },
          { $set: { category: 'urinalysis' } }
        );
        console.log(`   ✅ Updated category to 'urinalysis'`);
      } else {
        console.log(`   ✅ Category is correct`);
      }
    }
    // Handle any other variants
    else {
      if (test.category !== 'urinalysis') {
        await testCatalogModel.updateOne(
          { _id: test._id },
          { $set: { category: 'urinalysis' } }
        );
        console.log(`   ✅ Updated category to 'urinalysis'`);
      } else {
        console.log(`   ✅ Category is correct`);
      }
    }
    console.log('');
  }

  // Verify the changes
  console.log('\n📊 Verification - All Urine Protein Tests:');
  const updatedTests = await testCatalogModel.find({
    $or: [
      { code: 'UPROTEIN' },
      { code: 'URINE-PROTEIN' },
      { code: 'UPRO' },
      { name: { $regex: /urine.*protein/i } }
    ]
  }).sort({ code: 1 });

  for (const test of updatedTests) {
    console.log(`\n${test.code} - ${test.name}`);
    console.log(`  Category: ${test.category}`);
    console.log(`  Subcategory: ${test.subcategory || 'None'}`);
    console.log(`  Panel: ${test.panelCode || 'None'} ${test.panelName ? `(${test.panelName})` : ''}`);
    console.log(`  Active (Orderable): ${test.isActive}`);
    console.log(`  Price: Le ${test.price}`);
    console.log(`  Sample Type: ${test.sampleType}`);
  }

  console.log('\n\n📝 Summary:');
  console.log('  • URINE-PROTEIN (dipstick): Part of Urinalysis panel, NOT separately orderable');
  console.log('  • UPROTEIN (quantitative): Standalone test, separately orderable');
  console.log('  • Both will appear under "Urinalysis" category in reports');

  await app.close();
  console.log('\n✅ Urine protein configuration fix completed successfully');
}

fixUrineProteinCategory().catch(console.error);