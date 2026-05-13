/**
 * Reset Transactional Data Script
 * 
 * This script clears all transactional data (orders, results, patients, payments)
 * while preserving configuration data (test catalog, panels, users, settings)
 * 
 * Usage: npm run reset-data
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

async function resetTransactionalData() {
  console.log('🔄 Starting transactional data reset...\n');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    // Get all models
    const orderModel = app.get<Model<any>>(getModelToken('Order'));
    const patientModel = app.get<Model<any>>(getModelToken('Patient'));
    const resultModel = app.get<Model<any>>(getModelToken('Result'));
    const paymentModel = app.get<Model<any>>(getModelToken('Payment'));
    const sampleModel = app.get<Model<any>>(getModelToken('Sample'));
    const auditLogModel = app.get<Model<any>>(getModelToken('AuditLog'));

    // Count existing records
    console.log('📊 Current data counts:');
    const orderCount = await orderModel.countDocuments();
    const patientCount = await patientModel.countDocuments();
    const resultCount = await resultModel.countDocuments();
    const paymentCount = await paymentModel.countDocuments();
    const sampleCount = await sampleModel.countDocuments();
    const auditCount = await auditLogModel.countDocuments();

    console.log(`   Orders: ${orderCount}`);
    console.log(`   Patients: ${patientCount}`);
    console.log(`   Results: ${resultCount}`);
    console.log(`   Payments: ${paymentCount}`);
    console.log(`   Samples: ${sampleCount}`);
    console.log(`   Audit Logs: ${auditCount}\n`);

    // Confirm deletion
    console.log('⚠️  WARNING: This will delete ALL transactional data!');
    console.log('   The following will be preserved:');
    console.log('   ✓ Test Catalog');
    console.log('   ✓ Test Panels');
    console.log('   ✓ Users');
    console.log('   ✓ System Settings\n');

    // Delete transactional data
    console.log('🗑️  Deleting transactional data...\n');

    const deletedOrders = await orderModel.deleteMany({});
    console.log(`   ✓ Deleted ${deletedOrders.deletedCount} orders`);

    const deletedPatients = await patientModel.deleteMany({});
    console.log(`   ✓ Deleted ${deletedPatients.deletedCount} patients`);

    const deletedResults = await resultModel.deleteMany({});
    console.log(`   ✓ Deleted ${deletedResults.deletedCount} results`);

    const deletedPayments = await paymentModel.deleteMany({});
    console.log(`   ✓ Deleted ${deletedPayments.deletedCount} payments`);

    const deletedSamples = await sampleModel.deleteMany({});
    console.log(`   ✓ Deleted ${deletedSamples.deletedCount} samples`);

    const deletedAudits = await auditLogModel.deleteMany({});
    console.log(`   ✓ Deleted ${deletedAudits.deletedCount} audit logs\n`);

    // Verify deletion
    console.log('✅ Verification:');
    console.log(`   Orders remaining: ${await orderModel.countDocuments()}`);
    console.log(`   Patients remaining: ${await patientModel.countDocuments()}`);
    console.log(`   Results remaining: ${await resultModel.countDocuments()}`);
    console.log(`   Payments remaining: ${await paymentModel.countDocuments()}`);
    console.log(`   Samples remaining: ${await sampleModel.countDocuments()}`);
    console.log(`   Audit Logs remaining: ${await auditLogModel.countDocuments()}\n`);

    console.log('✨ Transactional data reset complete!');
    console.log('   Your application is now ready for fresh data.\n');

  } catch (error) {
    console.error('❌ Error resetting data:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Run the script
resetTransactionalData()
  .then(() => {
    console.log('✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Script failed:', error);
    process.exit(1);
  });
