import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TestCatalog } from './schemas/test-catalog.schema';
import { Result } from './schemas/result.schema';

const TARGET_SUBCATEGORY = 'Dipstick/Chemical';
const TARGET_CATEGORY = 'urinalysis';
const PROTEIN_CODES = ['URINE-PROTEIN', 'URINEPROTEIN', 'UPROTEIN', 'UPRO'];

async function updateUrineProteinSubcategory() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const resultModel = app.get<Model<Result>>('ResultModel');

  console.log('\nUpdating urine protein subcategory to Dipstick/Chemical...\n');

  try {
    console.log('1) Updating test catalog entries...');

    const catalogUpdate = await testCatalogModel.updateMany(
      {
        $or: [
          { code: { $in: PROTEIN_CODES } },
          { name: { $regex: /urine\s*protein/i } },
        ],
      },
      {
        $set: {
          category: TARGET_CATEGORY,
          subcategory: TARGET_SUBCATEGORY,
        },
      },
    );

    console.log(
      '   Matched: ' +
        catalogUpdate.matchedCount +
        ', Updated: ' +
        catalogUpdate.modifiedCount,
    );

    console.log('\n2) Updating saved result entries...');

    const resultUpdate = await resultModel.updateMany(
      { testCode: { $in: PROTEIN_CODES } },
      {
        $set: {
          category: TARGET_CATEGORY,
          subcategory: TARGET_SUBCATEGORY,
        },
      },
    );

    console.log(
      '   Matched: ' +
        resultUpdate.matchedCount +
        ', Updated: ' +
        resultUpdate.modifiedCount,
    );

    console.log(
      '\nDone. Urine protein should now appear under Dipstick/Chemical, not Other.',
    );
  } catch (error) {
    console.error('Failed to update urine protein subcategory:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateUrineProteinSubcategory()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
