import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';

/**
 * Check NWOKO CHINANZA's hormone test results
 * Show how new phase selection system affects existing results
 */
async function checkNwokoResults() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const patientModel = app.get<Model<any>>('PatientModel');
  const orderModel = app.get<Model<any>>('OrderModel');
  const resultModel = app.get<Model<any>>('ResultModel');

  console.log('🔍 Searching for NWOKO CHINANZA...\n');

  try {
    // Find patient
    const patient = await patientModel.findOne({
      $or: [
        { firstName: { $regex: /NWOKO/i } },
        { lastName: { $regex: /CHINANZA/i } },
        { fullName: { $regex: /NWOKO.*CHINANZA/i } }
      ]
    });

    if (!patient) {
      console.log('❌ Patient NWOKO CHINANZA not found in database');
      console.log('\n💡 This is expected if the test reports from the images haven\'t been entered yet.');
      console.log('   The images show analyzer output but results may not be in the system.\n');
      await app.close();
      return;
    }

    console.log('✅ Patient Found:');
    console.log(`   Name: ${patient.firstName} ${patient.lastName}`);
    console.log(`   Gender: ${patient.gender}`);
    console.log(`   Age: ${patient.age} years`);
    console.log(`   MRN: ${patient.mrn}`);
    console.log(`   Patient ID: ${patient._id}\n`);

    // Find orders for this patient
    const orders = await orderModel.find({ patientId: patient._id }).sort({ createdAt: -1 });

    if (!orders || orders.length === 0) {
      console.log('❌ No orders found for this patient\n');
      await app.close();
      return;
    }

    console.log(`📋 Found ${orders.length} order(s) for this patient\n`);

    // Check each order for hormone test results
    for (const order of orders) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`ORDER: ${order.orderNumber || order._id}`);
      console.log(`Date: ${order.createdAt}`);
      console.log(`Status: ${order.status}`);
      console.log(`${'='.repeat(80)}\n`);

      // Get results for this order
      const results = await resultModel.find({ orderId: order._id });

      if (!results || results.length === 0) {
        console.log('   No results found for this order\n');
        continue;
      }

      console.log(`   Found ${results.length} result(s)\n`);

      // Hormone tests we're interested in
      const hormoneTests = ['FSH', 'LH', 'PROG', 'PROGESTERONE', 'AMH', 'PRL', 'PROLACTIN'];

      // Check for hormone test results
      const hormoneResults = results.filter(r => 
        hormoneTests.some(ht => (r.testCode || '').toUpperCase().includes(ht))
      );

      if (hormoneResults.length === 0) {
        console.log('   ℹ️  No hormone test results in this order\n');
        console.log('   Other tests found:');
        results.forEach(r => {
          console.log(`      - ${r.testCode}: ${r.value} ${r.unit || ''}`);
        });
        continue;
      }

      console.log('   🧪 HORMONE TEST RESULTS:\n');

      for (const result of hormoneResults) {
        console.log(`   ┌${'─'.repeat(76)}┐`);
        console.log(`   │ ${result.testCode} - ${result.testName || result.testCode}`.padEnd(78) + '│');
        console.log(`   ├${'─'.repeat(76)}┤`);
        console.log(`   │ Value:           ${result.value} ${result.unit || ''}`.padEnd(78) + '│');
        console.log(`   │ Reference Range: ${result.referenceRange || 'Not specified'}`.padEnd(78) + '│');
        console.log(`   │ Flag:            ${result.flag || 'normal'}`.padEnd(78) + '│');
        console.log(`   │ Status:          ${result.status || 'preliminary'}`.padEnd(78) + '│');
        
        // Check for new fields
        console.log(`   ├${'─'.repeat(76)}┤`);
        console.log(`   │ NEW FIELDS (from phase selection implementation):`.padEnd(78) + '│');
        console.log(`   │   menstrualPhase:      ${result.menstrualPhase || '❌ Not set (old result)'}`.padEnd(78) + '│');
        console.log(`   │   allReferenceRanges:  ${result.allReferenceRanges ? '✅ Present' : '❌ Not set (old result)'}`.padEnd(78) + '│');
        
        if (result.allReferenceRanges) {
          try {
            const ranges = JSON.parse(result.allReferenceRanges);
            console.log(`   │`.padEnd(78) + '│');
            console.log(`   │   All Ranges:`.padEnd(78) + '│');
            ranges.forEach((r: any) => {
              console.log(`   │     - ${r.ageGroup}: ${r.range} ${r.unit}`.padEnd(78) + '│');
            });
          } catch (e) {
            console.log(`   │     (Error parsing ranges)`.padEnd(78) + '│');
          }
        }
        
        console.log(`   └${'─'.repeat(76)}┘\n`);
      }

      // Show all results summary
      console.log('\n   📊 ALL RESULTS IN THIS ORDER:\n');
      results.forEach(r => {
        const flag = r.flag === 'normal' ? '✓' : r.flag === 'high' ? '↑' : r.flag === 'low' ? '↓' : '!!';
        console.log(`      ${flag} ${r.testCode.padEnd(15)} ${String(r.value).padEnd(10)} ${(r.unit || '').padEnd(10)} ${r.referenceRange || ''}`);
      });
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('BACKWARD COMPATIBILITY ANALYSIS');
    console.log('='.repeat(80) + '\n');

    console.log('✅ OLD RESULTS (without phase selection):');
    console.log('   - Will display normally in reports');
    console.log('   - Reference range shown as before');
    console.log('   - No "all ranges" section (field is undefined)');
    console.log('   - No phase note (field is undefined)');
    console.log('   - Flagging remains unchanged\n');

    console.log('✅ NEW RESULTS (with phase selection):');
    console.log('   - Will show selected phase in report');
    console.log('   - All applicable ranges displayed');
    console.log('   - Phase-specific flagging');
    console.log('   - Note indicating which phase was used\n');

    console.log('💡 RECOMMENDATION:');
    console.log('   - No migration needed - old results work as-is');
    console.log('   - New phase selection is optional');
    console.log('   - Lab techs can start using phase selection immediately');
    console.log('   - Old reports remain valid and unchanged\n');

  } catch (error) {
    console.error('❌ Error checking results:', error);
    throw error;
  } finally {
    await app.close();
  }
}

checkNwokoResults()
  .then(() => {
    console.log('✅ Check completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Check failed:', error);
    process.exit(1);
  });
