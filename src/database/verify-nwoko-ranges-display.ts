import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';

/**
 * Verify NWOKO CHINANZA's results have all ranges stored
 * and show how they will display in reports
 */
async function verifyRangesDisplay() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const patientModel = app.get<Model<any>>('PatientModel');
  const orderModel = app.get<Model<any>>('OrderModel');
  const resultModel = app.get<Model<any>>('ResultModel');

  console.log('🔍 Verifying NWOKO CHINANZA\'s Results Display\n');

  try {
    // Find patient
    const patient = await patientModel.findOne({
      $or: [
        { firstName: { $regex: /NWOKO/i } },
        { lastName: { $regex: /CHINANZA/i } }
      ]
    });

    if (!patient) {
      console.log('❌ Patient not found');
      await app.close();
      return;
    }

    // Find order
    const order = await orderModel.findOne({ 
      patientId: patient._id,
      orderNumber: 'ORD-20260421-0002'
    });

    if (!order) {
      console.log('❌ Order not found');
      await app.close();
      return;
    }

    // Get results
    const results = await resultModel.find({ orderId: order._id });

    console.log('📊 RESULTS DATA VERIFICATION\n');
    console.log('='.repeat(80) + '\n');

    for (const result of results) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`TEST: ${result.testCode} - ${result.testName}`);
      console.log('─'.repeat(80));
      
      console.log(`\n📌 Basic Info:`);
      console.log(`   Value: ${result.value} ${result.unit}`);
      console.log(`   Reference Range: ${result.referenceRange}`);
      console.log(`   Flag: ${result.flag}`);
      console.log(`   Menstrual Phase: ${result.menstrualPhase || 'Not set'}`);
      
      console.log(`\n📋 All Reference Ranges Field:`);
      if (result.allReferenceRanges) {
        console.log(`   ✅ Field exists: YES`);
        console.log(`   Type: ${typeof result.allReferenceRanges}`);
        console.log(`   Length: ${result.allReferenceRanges.length} characters`);
        
        try {
          const ranges = JSON.parse(result.allReferenceRanges);
          console.log(`   Parsed successfully: YES`);
          console.log(`   Number of ranges: ${ranges.length}`);
          console.log(`\n   📝 All Ranges:`);
          ranges.forEach((r: any, i: number) => {
            const isSelected = result.menstrualPhase && 
              r.ageGroup.toLowerCase().includes(result.menstrualPhase.toLowerCase());
            const marker = isSelected ? '►' : ' ';
            console.log(`   ${marker} ${i + 1}. ${r.ageGroup}: ${r.range} ${r.unit}`);
          });
        } catch (e) {
          console.log(`   ❌ Error parsing: ${e.message}`);
          console.log(`   Raw value: ${result.allReferenceRanges.substring(0, 100)}...`);
        }
      } else {
        console.log(`   ❌ Field exists: NO`);
        console.log(`   This result doesn't have all ranges stored`);
      }
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('REPORT DISPLAY SIMULATION');
    console.log('='.repeat(80) + '\n');

    console.log('This is how the results will appear in the printed report:\n');

    for (const result of results) {
      console.log('┌────────────────────────┬──────────────┬──────────────────┬────────────────┐');
      console.log(`│ ${result.testCode.padEnd(22)} │ ${String(result.value).padEnd(12)} │ ${(result.referenceRange || '').padEnd(16)} │ ${(result.unit || '').padEnd(14)} │`);
      console.log('├────────────────────────┴──────────────┴──────────────────┴────────────────┤');
      
      if (result.allReferenceRanges) {
        try {
          const ranges = JSON.parse(result.allReferenceRanges);
          console.log('│ All Reference Ranges:                                                    │');
          
          // Format ranges in a readable way
          const rangeStrings = ranges.map((r: any) => {
            const isSelected = result.menstrualPhase && 
              r.ageGroup.toLowerCase().includes(result.menstrualPhase.toLowerCase());
            const prefix = isSelected ? '**' : '';
            const suffix = isSelected ? '**' : '';
            return `${prefix}${r.ageGroup}: ${r.range} ${r.unit}${suffix}`;
          });
          
          // Split into multiple lines if needed
          let currentLine = '│   ';
          for (let i = 0; i < rangeStrings.length; i++) {
            const rangeStr = rangeStrings[i];
            if (i > 0) {
              if (currentLine.length + rangeStr.length + 3 > 76) {
                console.log(currentLine.padEnd(76) + '│');
                currentLine = '│   ' + rangeStr;
              } else {
                currentLine += ' | ' + rangeStr;
              }
            } else {
              currentLine += rangeStr;
            }
          }
          if (currentLine.length > 4) {
            console.log(currentLine.padEnd(76) + '│');
          }
          
          if (result.menstrualPhase) {
            console.log(`│   (Flagged based on ${result.menstrualPhase} phase)`.padEnd(76) + '│');
          }
        } catch (e) {
          console.log('│   Error displaying ranges                                               │');
        }
      } else {
        console.log('│   (No additional ranges available)                                       │');
      }
      
      console.log('└──────────────────────────────────────────────────────────────────────────┘');
      console.log('');
    }

    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80) + '\n');

    const withRanges = results.filter(r => r.allReferenceRanges).length;
    const withPhase = results.filter(r => r.menstrualPhase).length;
    const total = results.length;

    console.log(`Total Results: ${total}`);
    console.log(`With All Ranges: ${withRanges} (${Math.round(withRanges/total*100)}%)`);
    console.log(`With Phase Selection: ${withPhase} (${Math.round(withPhase/total*100)}%)`);
    
    if (withRanges === total) {
      console.log('\n✅ All results have complete range information!');
    } else {
      console.log(`\n⚠️  ${total - withRanges} result(s) missing range information`);
    }

    if (withPhase > 0) {
      console.log(`✅ ${withPhase} result(s) have phase selection!`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await app.close();
  }
}

verifyRangesDisplay()
  .then(() => {
    console.log('\n✅ Verification completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Verification failed:', error);
    process.exit(1);
  });
