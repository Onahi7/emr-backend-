import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { OrderTest } from './schemas/order-test.schema';
import { Order } from './schemas/order.schema';

async function checkOrderTests() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const orderTestModel = app.get<Model<OrderTest>>('OrderTestModel');
  const orderModel = app.get<Model<Order>>('OrderModel');

  console.log('🔍 Checking Order Tests in Database...\n');

  // Get recent orders
  const recentOrders = await orderModel
    .find()
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

  console.log(`Found ${recentOrders.length} recent orders\n`);

  for (const order of recentOrders) {
    console.log('='.repeat(80));
    console.log(`📋 Order: ${order.orderNumber}`);
    console.log(`   Created: ${order.createdAt}`);
    console.log(`   Status: ${order.status}`);

    // Get order tests for this order
    const orderTests = await orderTestModel
      .find({ orderId: order._id })
      .lean();

    console.log(`\n   Tests (${orderTests.length}):`);
    
    // Group by panel
    const byPanel = new Map<string, any[]>();
    const standalone: any[] = [];

    for (const test of orderTests) {
      if (test.panelCode) {
        const key = test.panelCode;
        if (!byPanel.has(key)) {
          byPanel.set(key, []);
        }
        byPanel.get(key)!.push(test);
      } else {
        standalone.push(test);
      }
    }

    // Display panels
    if (byPanel.size > 0) {
      console.log('\n   📦 PANELS:');
      for (const [panelCode, tests] of byPanel.entries()) {
        const panelName = tests[0]?.panelName || panelCode;
        console.log(`\n      ${panelCode} - ${panelName} (${tests.length} tests)`);
        tests.forEach((test, idx) => {
          console.log(`         ${idx + 1}. ${test.testCode} - ${test.testName}`);
        });
      }
    }

    // Display standalone tests
    if (standalone.length > 0) {
      console.log('\n   🔬 STANDALONE TESTS:');
      standalone.forEach((test, idx) => {
        console.log(`      ${idx + 1}. ${test.testCode} - ${test.testName}`);
      });
    }

    console.log('\n');
  }

  // Summary statistics
  const totalOrderTests = await orderTestModel.countDocuments();
  const withPanel = await orderTestModel.countDocuments({ panelCode: { $exists: true, $ne: null } });
  const withoutPanel = totalOrderTests - withPanel;

  console.log('='.repeat(80));
  console.log('\n📊 SUMMARY:');
  console.log(`   Total OrderTests: ${totalOrderTests}`);
  console.log(`   With panelCode: ${withPanel} (${((withPanel / totalOrderTests) * 100).toFixed(1)}%)`);
  console.log(`   Without panelCode: ${withoutPanel} (${((withoutPanel / totalOrderTests) * 100).toFixed(1)}%)`);

  // Check for FBC specifically
  const fbcTests = await orderTestModel.find({ panelCode: 'FBC' }).lean();
  console.log(`\n   FBC panel tests: ${fbcTests.length}`);
  
  if (fbcTests.length > 0) {
    console.log(`   Sample FBC test: ${fbcTests[0].testCode} - ${fbcTests[0].testName}`);
    console.log(`   panelCode: ${fbcTests[0].panelCode}`);
    console.log(`   panelName: ${fbcTests[0].panelName}`);
  }

  await app.close();
  console.log('\n✅ Check completed');
}

checkOrderTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error checking order tests:', error);
    process.exit(1);
  });
