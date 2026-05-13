import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function removeUProtein() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('🗑️  Removing U-PROTEIN test from catalog...\n');

  // Find and remove U-PROTEIN test
  const result = await testCatalogModel.deleteMany({
    $or: [
      { code: 'U-PROTEIN' },
      { code: 'URINE-PROTEIN' },
      { code: { $regex: /^U-?PROTEIN$/i } }
    ]
  });

  console.log(`✅ Removed ${result.deletedCount} test(s)`);

  // Verify removal
  const remaining = await testCatalogModel.find({
    code: { $regex: /protein/i }
  }).lean();

  if (remaining.length > 0) {
    console.log('\n📋 Remaining protein-related tests:');
    remaining.forEach(test => {
      console.log(`   - ${test.code}: ${test.name} (${test.category})`);
    });
  } else {
    console.log('\n✅ No protein-related tests found in catalog');
  }

  await app.close();
  console.log('\n✅ Cleanup completed');
}

removeUProtein()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error removing U-PROTEIN:', error);
    process.exit(1);
  });
