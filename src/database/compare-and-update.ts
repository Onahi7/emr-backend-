import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function compareAndUpdate() {
  console.log('🔍 Checking current database state...\n');
  
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  const totalCount = await testCatalogModel.countDocuments();
  console.log(`Current tests in database: ${totalCount}`);

  const withRanges = await testCatalogModel.countDocuments({
    referenceRanges: { $exists: true, $ne: [] }
  });
  console.log(`Tests with reference ranges: ${withRanges} / ${totalCount}`);

  const withoutRanges = totalCount - withRanges;
  
  if (withoutRanges > 0) {
    console.log(`\n⚠️  ${withoutRanges} tests are missing reference ranges!`);
    console.log('\n💡 Recommendation: Run the seed file to update with comprehensive ranges');
    console.log('   Command: npx ts-node src/database/seed-test-catalog.ts');
  } else {
    console.log('\n✅ All tests have reference ranges!');
    
    // Check if ranges are comprehensive
    const sampleTest = await testCatalogModel.findOne({ code: 'HB' });
    if (sampleTest && sampleTest.referenceRanges) {
      console.log(`\n📋 Sample: Hemoglobin has ${sampleTest.referenceRanges.length} reference ranges`);
      if (sampleTest.referenceRanges.length >= 10) {
        console.log('✅ Ranges appear comprehensive (age/gender-specific)');
      } else {
        console.log('⚠️  Ranges may need updating for age/gender specificity');
        console.log('   Run seed to update: npx ts-node src/database/seed-test-catalog.ts');
      }
    }
  }

  await app.close();
  process.exit(0);
}

compareAndUpdate().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
