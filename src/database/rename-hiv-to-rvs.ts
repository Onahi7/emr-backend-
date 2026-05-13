import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { Result } from './schemas/result.schema';
import { OrderTest } from './schemas/order-test.schema';

/**
 * Migration: Rename HIV → RVS and HIVP24 → RVSP24 across the database.
 *
 * Updates:
 *   - test_catalog collection (code, name, description)
 *   - results collection (testCode, testName)
 *   - order_tests collection (testCode, testName)
 *
 * Run with: pnpm ts-node src/database/rename-hiv-to-rvs.ts
 */
async function renameHivToRvs() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const testCatalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));
  const resultModel = app.get<Model<Result>>(getModelToken(Result.name));
  const orderTestModel = app.get<Model<OrderTest>>(getModelToken(OrderTest.name));

  console.log('═'.repeat(60));
  console.log('  MIGRATION: Rename HIV → RVS');
  console.log('═'.repeat(60));

  // ── 1. Update test_catalog ───────────────────────────────────────────
  console.log('\n📦 Updating test_catalog...');

  const catalogHiv = await testCatalogModel.findOneAndUpdate(
    { code: 'HIV' },
    {
      $set: {
        code: 'RVS',
        name: 'RVS Rapid Test',
        description: 'RVS antibody rapid test — Reactive / Non-Reactive',
      },
    },
    { new: true },
  );
  console.log(`   HIV → RVS: ${catalogHiv ? '✅ Updated' : '⚠️  Not found (already migrated?)'}`);

  const catalogHivP24 = await testCatalogModel.findOneAndUpdate(
    { code: 'HIVP24' },
    {
      $set: {
        code: 'RVSP24',
        name: 'RVS P24 Antigen',
        description: 'RVS P24 antigen early-detection test — Reactive / Non-Reactive',
      },
    },
    { new: true },
  );
  console.log(`   HIVP24 → RVSP24: ${catalogHivP24 ? '✅ Updated' : '⚠️  Not found (already migrated?)'}`);

  // ── 2. Update results ────────────────────────────────────────────────
  console.log('\n🧪 Updating results...');

  const resultHiv = await resultModel.updateMany(
    { testCode: 'HIV' },
    {
      $set: {
        testCode: 'RVS',
        testName: 'RVS Rapid Test',
      },
    },
  );
  console.log(`   HIV results updated: ${resultHiv.modifiedCount}`);

  const resultHivP24 = await resultModel.updateMany(
    { testCode: 'HIVP24' },
    {
      $set: {
        testCode: 'RVSP24',
        testName: 'RVS P24 Antigen',
      },
    },
  );
  console.log(`   HIVP24 results updated: ${resultHivP24.modifiedCount}`);

  // ── 3. Update order_tests ────────────────────────────────────────────
  console.log('\n📋 Updating order_tests...');

  const orderTestHiv = await orderTestModel.updateMany(
    { testCode: 'HIV' },
    {
      $set: {
        testCode: 'RVS',
        testName: 'RVS Rapid Test',
      },
    },
  );
  console.log(`   HIV order_tests updated: ${orderTestHiv.modifiedCount}`);

  const orderTestHivP24 = await orderTestModel.updateMany(
    { testCode: 'HIVP24' },
    {
      $set: {
        testCode: 'RVSP24',
        testName: 'RVS P24 Antigen',
      },
    },
  );
  console.log(`   HIVP24 order_tests updated: ${orderTestHivP24.modifiedCount}`);

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  ✅ Migration complete!');
  console.log('═'.repeat(60));
  console.log('\nSummary:');
  console.log(`   test_catalog: HIV→RVS (${catalogHiv ? 'done' : 'skip'}), HIVP24→RVSP24 (${catalogHivP24 ? 'done' : 'skip'})`);
  console.log(`   results:      ${resultHiv.modifiedCount} HIV, ${resultHivP24.modifiedCount} HIVP24`);
  console.log(`   order_tests:  ${orderTestHiv.modifiedCount} HIV, ${orderTestHivP24.modifiedCount} HIVP24`);
  console.log('');

  await app.close();
}

renameHivToRvs()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
