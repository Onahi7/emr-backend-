import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TestCatalog } from './schemas/test-catalog.schema';
import { Result } from './schemas/result.schema';
import { ResultsService } from '../results/results.service';

const CRP_CODE = 'CRP';
const HSCRP_CODES = ['HSCRP', 'HSCR'];
const CRP_RANGE = '0-10.0';
const HSCRP_RANGE = '0-1.0';

async function updateCrpHscrpRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const resultModel = app.get<Model<Result>>('ResultModel');
  const resultsService = app.get(ResultsService);

  console.log('\nUpdating CRP/hsCRP ranges and recalculating flags...\n');

  try {
    console.log('1) Updating test catalog ranges...');

    const crpCatalogUpdate = await testCatalogModel.updateOne(
      { code: CRP_CODE },
      {
        $set: {
          unit: 'mg/L',
          referenceRange: CRP_RANGE,
          referenceRanges: [
            { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: CRP_RANGE, unit: 'mg/L' },
          ],
        },
      },
    );

    console.log(
      '   CRP matched: ' + crpCatalogUpdate.matchedCount + ', updated: ' + crpCatalogUpdate.modifiedCount,
    );

    const hscrpCatalogUpdate = await testCatalogModel.updateMany(
      { code: { $in: HSCRP_CODES } },
      {
        $set: {
          unit: 'mg/L',
          referenceRange: HSCRP_RANGE,
          referenceRanges: [
            { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: HSCRP_RANGE, unit: 'mg/L' },
          ],
        },
      },
    );

    console.log(
      '   HSCRP/HSCR matched: ' +
        hscrpCatalogUpdate.matchedCount +
        ', updated: ' +
        hscrpCatalogUpdate.modifiedCount,
    );

    console.log('\n2) Updating existing result ranges and flags...');

    const results = await resultModel
      .find({ testCode: { $in: [CRP_CODE, ...HSCRP_CODES] } })
      .select('_id testCode value referenceRange flag unit')
      .lean();

    if (results.length === 0) {
      console.log('   No CRP/HSCRP results found.');
    } else {
      const bulkOps: any[] = [];
      let flagChanges = 0;

      for (const result of results) {
        const targetRange = result.testCode === CRP_CODE ? CRP_RANGE : HSCRP_RANGE;
        const nextFlag = resultsService.calculateFlag(String(result.value || ''), targetRange);

        const updateSet: Record<string, any> = {};

        if ((result.referenceRange || '').trim() !== targetRange) {
          updateSet.referenceRange = targetRange;
        }

        if ((result.unit || '').trim() !== 'mg/L') {
          updateSet.unit = 'mg/L';
        }

        if (result.flag !== nextFlag) {
          updateSet.flag = nextFlag;
          flagChanges += 1;
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

      console.log('   Found: ' + results.length + ', updated: ' + bulkOps.length + ', flags changed: ' + flagChanges);
    }

    console.log('\nDone. CRP and hsCRP now use numeric normal ranges and support comparator-style values.');
  } catch (error) {
    console.error('Failed to update CRP/hsCRP ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateCrpHscrpRanges()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
