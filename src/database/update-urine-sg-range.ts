import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TestCatalog } from './schemas/test-catalog.schema';
import { Result, ResultFlagEnum } from './schemas/result.schema';

const TEST_CODE = 'URINE-SG';
const NEW_RANGE = '1.000-1.030';
const MIN_SG = 1.0;
const MAX_SG = 1.03;

function calculateSpecificGravityFlag(value: string): ResultFlagEnum | undefined {
  const numericValue = parseFloat((value || '').trim());
  if (Number.isNaN(numericValue)) {
    return undefined;
  }

  if (numericValue < MIN_SG) {
    return ResultFlagEnum.LOW;
  }

  if (numericValue > MAX_SG) {
    return ResultFlagEnum.HIGH;
  }

  return ResultFlagEnum.NORMAL;
}

async function updateUrineSpecificGravityRange() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const resultModel = app.get<Model<Result>>('ResultModel');

  console.log('\nUpdating URINE-SG range to start from 1.000...\n');

  try {
    console.log('1) Updating test catalog entry...');

    const urineSg = await testCatalogModel.findOne({ code: TEST_CODE });

    if (!urineSg) {
      console.log('   URINE-SG not found in test catalog.');
    } else {
      urineSg.referenceRange = NEW_RANGE;

      if (Array.isArray(urineSg.referenceRanges) && urineSg.referenceRanges.length > 0) {
        urineSg.referenceRanges = urineSg.referenceRanges.map((item) => ({
          ...item,
          range: NEW_RANGE,
          unit: item.unit || 'SG',
        }));
      }

      await urineSg.save();
      console.log('   Test catalog updated: URINE-SG range is now 1.000-1.030.');
    }

    console.log('\n2) Updating existing URINE-SG results...');

    const results = await resultModel
      .find({ testCode: TEST_CODE })
      .select('_id value referenceRange flag')
      .lean();

    if (results.length === 0) {
      console.log('   No URINE-SG results found.');
    } else {
      const bulkOps: any[] = [];
      let flagUpdates = 0;

      for (const result of results) {
        const nextFlag = calculateSpecificGravityFlag(result.value);
        const updateSet: Record<string, any> = {};

        if ((result.referenceRange || '').trim() !== NEW_RANGE) {
          updateSet.referenceRange = NEW_RANGE;
        }

        if (nextFlag && result.flag !== nextFlag) {
          updateSet.flag = nextFlag;
          flagUpdates += 1;
        }

        if (Object.keys(updateSet).length > 0) {
          bulkOps.push({
            updateOne: {
              filter: { _id: result._id },
              update: { $set: updateSet },
            },
          });
        }
      }

      if (bulkOps.length > 0) {
        await resultModel.bulkWrite(bulkOps);
      }

      console.log(`   Found ${results.length} URINE-SG results, updated ${bulkOps.length}.`);
      console.log(`   Recalculated flags for ${flagUpdates} results.`);
    }

    console.log('\nDone. URINE-SG range now starts from 1.000.');
  } catch (error) {
    console.error('Failed to update URINE-SG range:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateUrineSpecificGravityRange()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
