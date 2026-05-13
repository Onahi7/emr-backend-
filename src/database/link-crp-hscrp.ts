import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Link CRP to automatically include HSCRP
 * 
 * When CRP is ordered, HSCRP will be automatically added to the order
 */

async function linkCrpHscrp() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🔗 Linking CRP to HSCRP...\n');

  try {
    // Update CRP to include HSCRP as a linked test
    const result = await testCatalogModel.updateOne(
      { code: 'CRP' },
      {
        $set: {
          linkedTests: ['HSCRP'],
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log('✅ CRP successfully linked to HSCRP');
      console.log('   When CRP is ordered, HSCRP will be automatically included');
      
      // Verify the update
      const crpTest = await testCatalogModel.findOne({ code: 'CRP' }).lean();
      console.log('\n📋 Verification:');
      console.log(`   CRP Test: ${crpTest?.name}`);
      console.log(`   Linked Tests: ${crpTest?.linkedTests?.join(', ') || 'None'}`);
    } else {
      console.log('⚠️  CRP test not found or already has linkedTests configured');
    }

    console.log('\n✅ Configuration complete!\n');

  } catch (error) {
    console.error('❌ Error linking CRP to HSCRP:', error);
    throw error;
  } finally {
    await app.close();
  }
}

linkCrpHscrp()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
