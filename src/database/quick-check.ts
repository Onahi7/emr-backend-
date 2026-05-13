import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function quickCheck() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  const totalCount = await testCatalogModel.countDocuments();
  console.log(`\n📊 Total tests: ${totalCount}`);

  const categories = await testCatalogModel.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  console.log('\n📁 By category:');
  categories.forEach(cat => console.log(`   ${cat._id}: ${cat.count}`));

  const withRanges = await testCatalogModel.countDocuments({
    referenceRanges: { $exists: true, $ne: [] }
  });
  console.log(`\n✅ Tests with reference ranges: ${withRanges} / ${totalCount}`);

  const withCritical = await testCatalogModel.countDocuments({
    'referenceRanges.criticalLow': { $exists: true }
  });
  console.log(`🚨 Tests with critical values: ${withCritical}`);

  // Sample one test with ranges
  const sample = await testCatalogModel.findOne({ 
    referenceRanges: { $exists: true, $ne: [] } 
  });
  
  if (sample) {
    console.log(`\n📋 Sample test: ${sample.code} - ${sample.name}`);
    console.log(`   Category: ${sample.category}`);
    console.log(`   Price: Le ${sample.price}`);
    console.log(`   Reference ranges: ${sample.referenceRanges?.length || 0}`);
    if (sample.referenceRanges && sample.referenceRanges.length > 0) {
      console.log(`   First range: ${sample.referenceRanges[0].ageGroup || 'N/A'} - ${sample.referenceRanges[0].range}`);
    }
  }

  await app.close();
  process.exit(0);
}

quickCheck().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
