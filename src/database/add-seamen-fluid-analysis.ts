import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TestCatalog } from './schemas/test-catalog.schema';

const SFA_TEST = {
  code: 'SFA',
  name: 'Seamen Fluid Analysis (SFA)',
  category: 'microbiology',
  price: 250,
  sampleType: 'other',
  turnaroundTime: 120,
  isActive: true,
  description: 'Descriptive fluid analysis with free-text laboratory observations',
};

async function addSeamenFluidAnalysis() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  try {
    const result = await testCatalogModel.updateOne(
      { code: SFA_TEST.code },
      { $set: SFA_TEST },
      { upsert: true },
    );

    const savedTest = await testCatalogModel
      .findOne({ code: SFA_TEST.code })
      .select('code name category price sampleType turnaroundTime isActive')
      .lean();

    console.log(
      result.upsertedCount > 0
        ? 'Seamen Fluid Analysis added to the test catalog.'
        : 'Seamen Fluid Analysis catalog entry updated.',
    );
    console.log(savedTest);
  } finally {
    await app.close();
  }
}

addSeamenFluidAnalysis()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to add Seamen Fluid Analysis:', error);
    process.exit(1);
  });
