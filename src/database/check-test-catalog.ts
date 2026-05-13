import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function checkTestCatalog() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('Checking test catalog in database...\n');

  // Get total count
  const totalCount = await testCatalogModel.countDocuments();
  console.log(`Total tests in database: ${totalCount}\n`);

  if (totalCount === 0) {
    console.log('❌ No tests found in database. Run seed-test-catalog.ts to populate.');
    await app.close();
    return;
  }

  // Get count by category
  const categories = await testCatalogModel.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  console.log('Tests by category:');
  categories.forEach(cat => {
    console.log(`  ${cat._id}: ${cat.count} tests`);
  });
  console.log('');

  // Check how many tests have reference ranges
  const testsWithRanges = await testCatalogModel.countDocuments({
    referenceRanges: { $exists: true, $ne: [] }
  });
  console.log(`Tests with reference ranges: ${testsWithRanges} / ${totalCount}`);

  // Sample a few tests to show their structure
  console.log('\n--- Sample Tests ---\n');
  
  const sampleTests = await testCatalogModel.find().limit(3);
  sampleTests.forEach(test => {
    console.log(`Code: ${test.code}`);
    console.log(`Name: ${test.name}`);
    console.log(`Category: ${test.category}`);
    console.log(`Price: Le ${test.price}`);
    console.log(`Unit: ${test.unit || 'N/A'}`);
    console.log(`Reference Ranges: ${test.referenceRanges?.length || 0} entries`);
    if (test.referenceRanges && test.referenceRanges.length > 0) {
      console.log('  Sample range:', JSON.stringify(test.referenceRanges[0], null, 2));
    }
    console.log('---');
  });

  // Check for tests with critical values
  const testsWithCritical = await testCatalogModel.countDocuments({
    'referenceRanges.criticalLow': { $exists: true }
  });
  console.log(`\nTests with critical value thresholds: ${testsWithCritical}`);

  // List all test codes
  console.log('\n--- All Test Codes ---');
  const allTests = await testCatalogModel.find({}, 'code name').sort({ code: 1 });
  allTests.forEach(test => {
    console.log(`  ${test.code}: ${test.name}`);
  });

  await app.close();
}

checkTestCatalog()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error checking test catalog:', error);
    process.exit(1);
  });
