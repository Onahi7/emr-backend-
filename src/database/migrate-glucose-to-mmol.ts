import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { Result } from './schemas/result.schema';

/**
 * Migration: Convert blood glucose results from mg/dL → mmol/L (÷ 18).
 * Also updates FBS/GLU/RBS reference ranges and units in test_catalog.
 *
 * Run with: pnpm migrate:glucose
 *
 * Safe to run multiple times — checks unit before converting.
 */
async function migrateGlucose() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const resultModel = app.get<Model<Result>>('ResultModel');
  const catalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  const GLUCOSE_CODES = ['GLU', 'FBS', 'RBS', 'FBG', 'RBG'];
  const CONVERSION_FACTOR = 18;

  // ── 1. Migrate existing results ─────────────────────────────────────────
  console.log('\n📊 Migrating glucose results (mg/dL → mmol/L)...');

  const results = await resultModel.find({
    testCode: { $in: GLUCOSE_CODES },
  });

  let converted = 0;
  let skipped = 0;

  for (const result of results) {
    // Skip if already in mmol/L
    if (result.unit === 'mmol/L') {
      skipped++;
      continue;
    }

    const numeric = parseFloat(result.value);
    if (isNaN(numeric)) {
      // Qualitative value (e.g. "Positive") — leave untouched
      skipped++;
      continue;
    }

    const mmol = Math.round((numeric / CONVERSION_FACTOR) * 10) / 10; // 1 d.p.

    // Recalculate reference range string if it looks like a mg/dL range
    let newRange = result.referenceRange || '';
    if (result.referenceRange && /\d/.test(result.referenceRange)) {
      // Attempt a simple conversion of numeric tokens in the range string
      newRange = result.referenceRange.replace(/[\d.]+/g, (n) => {
        const val = parseFloat(n);
        return isNaN(val) ? n : String(Math.round((val / CONVERSION_FACTOR) * 10) / 10);
      });
    }

    await resultModel.updateOne(
      { _id: result._id },
      {
        $set: {
          value: String(mmol),
          unit: 'mmol/L',
          referenceRange: newRange,
        },
      },
    );

    console.log(`  ✅ ${result.testCode} | ${result.value} mg/dL → ${mmol} mmol/L`);
    converted++;
  }

  console.log(`\n  Converted: ${converted}  |  Skipped (already mmol/L or non-numeric): ${skipped}`);

  // ── 2. Update test_catalog reference ranges & units ─────────────────────
  console.log('\n📋 Updating test catalog reference ranges...');

  const catalogUpdates: Record<string, object> = {
    GLU: {
      unit: 'mmol/L',
      referenceRanges: [
        { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '3.5-5.9',  unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
        { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '5.6-6.9',  unit: 'mmol/L' },
        { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥7.0',      unit: 'mmol/L' },
      ],
    },
    FBS: {
      unit: 'mmol/L',
      referenceRanges: [
        { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '3.5-5.9',  unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
        { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '5.6-6.9',  unit: 'mmol/L' },
        { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥7.0',      unit: 'mmol/L' },
      ],
    },
    RBS: {
      unit: 'mmol/L',
      referenceRanges: [
        { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '<7.8',      unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
        { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '7.8-11.0', unit: 'mmol/L' },
        { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥11.1',     unit: 'mmol/L' },
      ],
    },
    RBG: {
      unit: 'mmol/L',
      referenceRanges: [
        { ageGroup: 'Normal',      ageMin: 18, gender: 'all', range: '<7.8',      unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
        { ageGroup: 'Prediabetes', ageMin: 18, gender: 'all', range: '7.8-11.0', unit: 'mmol/L' },
        { ageGroup: 'Diabetes',    ageMin: 18, gender: 'all', range: '≥11.1',     unit: 'mmol/L' },
      ],
    },
  };

  for (const [code, update] of Object.entries(catalogUpdates)) {
    const res = await catalogModel.updateOne({ code }, { $set: update });
    if (res.matchedCount > 0) {
      console.log(`  ✅ test_catalog [${code}] updated to mmol/L`);
    } else {
      console.log(`  ⚠️  test_catalog [${code}] not found — skipped`);
    }
  }

  console.log('\n✅ Glucose migration complete.');
  await app.close();
}

migrateGlucose()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
