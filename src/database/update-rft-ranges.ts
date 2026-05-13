import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { getModelToken } from '@nestjs/mongoose';

/**
 * Migration: Update reference ranges and units for RFT/chemistry tests.
 *
 * - Urea:        range → 10.2-49.8 mg/dL (single universal range)
 * - Creatinine:  range → 0.4-1.10 mg/dL  (single universal range)
 * - Uric Acid:   range → 2.35-7.0 mg/dL  (single universal range)
 * - Total Bilirubin: unit confirmed as mg/dL
 *
 * Run with: pnpm update:rft-ranges
 */
async function updateRftRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));

  const updates = [
    {
      code: 'UREA',
      unit: 'mg/dL',
      referenceRanges: [
        { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '10.2-49.8', unit: 'mg/dL' },
      ],
    },
    {
      code: 'CREAT',
      unit: 'mg/dL',
      referenceRanges: [
        { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '0.4-1.10', unit: 'mg/dL', criticalHigh: '5.0' },
      ],
    },
    {
      code: 'UA',
      unit: 'mg/dL',
      referenceRanges: [
        { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '2.35-7.0', unit: 'mg/dL' },
      ],
    },
    {
      code: 'TBIL',
      unit: 'mg/dL',
      // keep existing reference ranges, just ensure unit is mg/dL
      referenceRanges: null,
    },
  ];

  console.log('\n📊 Updating reference ranges...\n');

  for (const item of updates) {
    const setPayload: any = { unit: item.unit };
    if (item.referenceRanges) {
      setPayload.referenceRanges = item.referenceRanges;
    }

    const result = await catalogModel.updateOne(
      { code: item.code },
      { $set: setPayload },
    );

    if (result.matchedCount === 0) {
      console.warn(`  ⚠️  ${item.code} — not found in catalog`);
    } else if (result.modifiedCount === 0) {
      console.log(`  ✓  ${item.code} — already up to date (no change)`);
    } else {
      const rangeStr = item.referenceRanges ? item.referenceRanges[0].range : 'unit only';
      console.log(`  ✅ ${item.code} → range: ${rangeStr} ${item.unit}`);
    }
  }

  console.log('\n✅ Reference range update complete.\n');
  await app.close();
}

migrateAndExit();

async function migrateAndExit() {
  try {
    await updateRftRanges();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
