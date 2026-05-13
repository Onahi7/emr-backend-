import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Update blood glucose reference ranges in the live database.
 * Edit the RANGES object below, then run:  pnpm update:glucose-ranges
 *
 * All values in mmol/L.
 */

const RANGES: Record<string, { unit: string; ranges: any[] }> = {
  GLU: {
    unit: 'mmol/L',
    ranges: [
      { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '3.5-5.9',  unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
      { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '5.6-6.9',  unit: 'mmol/L' },
      { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥7.0',     unit: 'mmol/L' },
    ],
  },
  FBS: {
    unit: 'mmol/L',
    ranges: [
      { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '3.5-5.9',  unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
      { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '5.6-6.9',  unit: 'mmol/L' },
      { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥7.0',     unit: 'mmol/L' },
    ],
  },
  RBS: {
    unit: 'mmol/L',
    ranges: [
      { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '<7.8',     unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
      { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '7.8-11.0', unit: 'mmol/L' },
      { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥11.1',    unit: 'mmol/L' },
    ],
  },
  RBG: {
    unit: 'mmol/L',
    ranges: [
      { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '<7.8',     unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
      { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '7.8-11.0', unit: 'mmol/L' },
      { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥11.1',    unit: 'mmol/L' },
    ],
  },
};

async function updateGlucoseRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalog = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n📋 Updating glucose reference ranges in test_catalog...\n');

  for (const [code, { unit, ranges }] of Object.entries(RANGES)) {
    const res = await catalog.findOneAndUpdate(
      { code },
      { $set: { unit, referenceRanges: ranges } },
      { new: true },
    );

    if (res) {
      console.log(`  ✅ [${code}] ${res.name}`);
      ranges.forEach((r) => console.log(`       ${r.ageGroup}: ${r.range} ${r.unit}`));
    } else {
      console.log(`  ⚠️  [${code}] not found in catalog — skipped`);
    }
  }

  console.log('\n✅ Done.');
  await app.close();
}

updateGlucoseRanges()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
