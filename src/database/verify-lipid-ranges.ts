import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function verifyLipidRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🔍 Verifying Lipid Profile & LDH Reference Ranges...\n');

  try {
    const tests = await testCatalogModel
      .find({ code: { $in: ['TG', 'LDL', 'HDL', 'CHOL', 'VLDL', 'LDH'] } })
      .select('code name unit referenceRanges')
      .lean();

    tests.forEach((test: any) => {
      console.log(`\n📊 ${test.code} - ${test.name}`);
      console.log(`   Unit: ${test.unit}`);
      console.log(`   Reference Ranges:`);
      test.referenceRanges?.forEach((range: any) => {
        console.log(`      • ${range.ageGroup}: ${range.range} ${range.unit}`);
        if (range.criticalLow) console.log(`        Critical Low: ${range.criticalLow}`);
        if (range.criticalHigh) console.log(`        Critical High: ${range.criticalHigh}`);
      });
    });

    console.log('\n✅ Verification complete!\n');
  } catch (error) {
    console.error('❌ Error verifying ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

verifyLipidRanges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
