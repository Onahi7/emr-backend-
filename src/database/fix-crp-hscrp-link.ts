import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TestCatalog } from './schemas/test-catalog.schema';

async function fixCrpHscrpLink() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

    const crpTest = await testCatalogModel.findOne({ code: 'CRP' }).lean();
    if (!crpTest) {
      console.error('CRP test not found in test catalog');
      process.exitCode = 1;
      return;
    }

    const updateResult = await testCatalogModel.updateOne(
      { code: 'CRP' },
      {
        $addToSet: {
          linkedTests: 'HSCRP',
        },
      },
    );

    const updated = await testCatalogModel.findOne({ code: 'CRP' }).lean();
    const linkedTests = updated?.linkedTests || [];

    console.log('CRP -> HSCRP link fix completed');
    console.log(`Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);
    console.log(`Current linked tests for CRP: ${linkedTests.join(', ') || 'None'}`);
  } finally {
    await app.close();
  }
}

fixCrpHscrpLink()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to apply CRP/HSCRP link fix:', error);
    process.exit(1);
  });
