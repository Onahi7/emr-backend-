import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { getModelToken } from '@nestjs/mongoose';

/**
 * Migration: Update individual test prices.
 *
 * - HDL Cholesterol:              200 → 120
 * - Hepatitis B (HBSAG):          35 → 50
 * - Hepatitis C (HCV):             35 → 70
 * - Urinalysis (URINE):                  90  (already correct, confirmed)
 *
 * Run with: pnpm update:prices
 */
async function updatePrices() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));

  const updates = [
    { code: 'HDL',   name: 'HDL Cholesterol',                price: 120 },
    { code: 'HBSAG', name: 'Hepatitis B Surface Antigen',    price: 50  },
    { code: 'HCV',   name: 'Hepatitis C Antibody',           price: 70  },
    { code: 'URINE', name: 'Urinalysis',                     price: 90  },
  ];

  console.log('\n💰 Updating test prices...\n');

  for (const item of updates) {
    const result = await catalogModel.updateOne(
      { code: item.code },
      { $set: { price: item.price } },
    );

    if (result.matchedCount === 0) {
      console.warn(`  ⚠️  ${item.code} — not found in catalog`);
    } else if (result.modifiedCount === 0) {
      console.log(`  ✓  ${item.code} — already at ${item.price} (no change)`);
    } else {
      console.log(`  ✅ ${item.code} (${item.name}) → price = ${item.price}`);
    }
  }

  console.log('\n✅ Price update complete.\n');
  await app.close();
}

migrateAndExit();

async function migrateAndExit() {
  try {
    await updatePrices();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
