import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { Result } from './schemas/result.schema';

const MCHC_TEST_CODE = 'MCHC';
const TARGET_UNIT = 'g/dL';

function formatScaledNumericValue(numericValue: number): string {
  if (!Number.isFinite(numericValue)) {
    return '';
  }

  return parseFloat(numericValue.toFixed(1)).toString();
}

function normalizeNumericString(rawValue?: string): string | undefined {
  if (rawValue === undefined || rawValue === null) {
    return rawValue;
  }

  const value = String(rawValue).trim();
  if (!value) {
    return value;
  }

  const numericValue = parseFloat(value);
  if (Number.isNaN(numericValue)) {
    return value;
  }

  const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
  return formatScaledNumericValue(normalizedValue);
}

function normalizeRange(rawRange?: string): string | undefined {
  if (rawRange === undefined || rawRange === null) {
    return rawRange;
  }

  const range = String(rawRange).trim();
  if (!range) {
    return range;
  }

  const sanitizedRange = range.replace(/\bg\s*\/\s*(?:d)?l\b/gi, '').trim();

  const rangeMatch = sanitizedRange.match(/^(-?\d*\.?\d+)\s*(?:-|–)\s*(-?\d*\.?\d+)$/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    const normalizedLow = low > 100 ? low / 10 : low;
    const normalizedHigh = high > 100 ? high / 10 : high;

    return `${formatScaledNumericValue(normalizedLow)}-${formatScaledNumericValue(normalizedHigh)}`;
  }

  const thresholdMatch = sanitizedRange.match(/^(<=|>=|<|>|≤|≥)\s*(-?\d*\.?\d+)$/);
  if (thresholdMatch) {
    const operator = thresholdMatch[1];
    const threshold = parseFloat(thresholdMatch[2]);
    const normalizedThreshold = threshold > 100 ? threshold / 10 : threshold;

    return `${operator} ${formatScaledNumericValue(normalizedThreshold)}`;
  }

  return sanitizedRange.replace(/-?\d*\.?\d+/g, (token) => {
    const numericValue = parseFloat(token);
    if (Number.isNaN(numericValue)) {
      return token;
    }

    const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
    return formatScaledNumericValue(normalizedValue);
  });
}

async function seedMchcGdl() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const resultModel = app.get<Model<Result>>('ResultModel');

  console.log('\nStarting MCHC g/L to g/dL seed update...\n');

  try {
    console.log('1) Updating test catalog for MCHC...');

    const mchcCatalog = await testCatalogModel.findOne({ code: MCHC_TEST_CODE });

    if (!mchcCatalog) {
      console.log('   MCHC test not found in test catalog.');
    } else {
      const normalizedReferenceRanges = (mchcCatalog.referenceRanges || []).map((item) => ({
        ...item,
        range: normalizeRange(item.range) || item.range,
        unit: TARGET_UNIT,
        criticalLow: normalizeNumericString(item.criticalLow),
        criticalHigh: normalizeNumericString(item.criticalHigh),
      }));

      mchcCatalog.unit = TARGET_UNIT;
      mchcCatalog.referenceRange = normalizeRange(mchcCatalog.referenceRange);
      mchcCatalog.referenceRanges = normalizedReferenceRanges;

      await mchcCatalog.save();

      console.log('   Updated MCHC catalog unit and ranges to g/dL.');
    }

    console.log('\n2) Updating saved MCHC results...');

    const mchcResults = await resultModel
      .find({ testCode: MCHC_TEST_CODE })
      .select('_id value unit referenceRange')
      .lean();

    if (mchcResults.length === 0) {
      console.log('   No saved MCHC results found.');
    } else {
      const bulkOps: any[] = [];

      for (const result of mchcResults) {
        const normalizedValue = normalizeNumericString(result.value) || result.value;
        const normalizedRange = normalizeRange(result.referenceRange);

        const hasValueChanged = normalizedValue !== result.value;
        const hasRangeChanged = normalizedRange !== result.referenceRange;
        const hasUnitChanged = result.unit !== TARGET_UNIT;

        if (hasValueChanged || hasRangeChanged || hasUnitChanged) {
          bulkOps.push({
            updateOne: {
              filter: { _id: result._id },
              update: {
                $set: {
                  value: normalizedValue,
                  referenceRange: normalizedRange,
                  unit: TARGET_UNIT,
                },
              },
            },
          });
        }
      }

      if (bulkOps.length > 0) {
        await resultModel.bulkWrite(bulkOps);
      }

      console.log(`   Found ${mchcResults.length} MCHC results, updated ${bulkOps.length}.`);
    }

    console.log('\nMCHC seed update completed successfully.');
  } catch (error) {
    console.error('Failed to run MCHC seed update:', error);
    throw error;
  } finally {
    await app.close();
  }
}

seedMchcGdl()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
