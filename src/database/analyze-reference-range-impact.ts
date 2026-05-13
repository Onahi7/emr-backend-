import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { Result } from './schemas/result.schema';
import { Patient } from './schemas/patient.schema';

/**
 * Analyze the impact of reference range changes on existing results
 * 
 * This script checks:
 * 1. How many WBC results for adult males might have different flags
 * 2. How many EOSA results for adults might have different flags
 */
async function analyzeImpact() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const resultModel = app.get<Model<Result>>('ResultModel');
  const patientModel = app.get<Model<Patient>>('PatientModel');

  console.log('Analyzing impact of reference range changes on existing results...\n');

  try {
    // 1. Analyze WBC results for adult males
    console.log('1. Analyzing WBC results for adult males...');
    console.log('   Old range: 4.00-11.00 x10⁹/L');
    console.log('   New range: 3.50-9.50 x10⁹/L\n');

    const wbcResults = await resultModel.find({ testCode: 'WBC' }).lean();
    console.log(`   Total WBC results: ${wbcResults.length}`);

    let wbcAdultMaleCount = 0;
    let wbcPotentiallyAffected = 0;
    const wbcAffectedDetails: any[] = [];

    for (const result of wbcResults) {
      const patient = await patientModel.findOne({ 
        _id: (await resultModel.findOne({ _id: result._id }).populate('orderId')).orderId 
      }).lean();
      
      if (!patient) continue;

      const age = patient.age || 0;
      const gender = patient.gender;

      // Check if adult male (age >= 13 and male)
      if (age >= 13 && gender === 'M') {
        wbcAdultMaleCount++;
        
        const value = parseFloat(result.value);
        if (!isNaN(value)) {
          // Check if value falls in the changed range
          // Old: 4.00-11.00, New: 3.50-9.50
          // Potentially affected: 3.50-3.99 (now normal, was low) or 9.51-11.00 (now high, was normal)
          if ((value >= 3.50 && value < 4.00) || (value > 9.50 && value <= 11.00)) {
            wbcPotentiallyAffected++;
            wbcAffectedDetails.push({
              resultId: result._id,
              patientAge: age,
              value: value,
              currentFlag: result.flag,
              referenceRange: result.referenceRange,
              reason: value < 4.00 ? 'Was LOW, now NORMAL' : 'Was NORMAL, now HIGH'
            });
          }
        }
      }
    }

    console.log(`   Adult male WBC results: ${wbcAdultMaleCount}`);
    console.log(`   Potentially affected (flag change): ${wbcPotentiallyAffected}`);
    
    if (wbcAffectedDetails.length > 0) {
      console.log('\n   Affected results details:');
      wbcAffectedDetails.slice(0, 10).forEach((detail, idx) => {
        console.log(`   ${idx + 1}. Value: ${detail.value}, Current flag: ${detail.currentFlag}, ${detail.reason}`);
      });
      if (wbcAffectedDetails.length > 10) {
        console.log(`   ... and ${wbcAffectedDetails.length - 10} more`);
      }
    }

    // 2. Analyze EOSA results for adults
    console.log('\n2. Analyzing EOSA (Eosinophils #) results for adults...');
    console.log('   Old range: 0.00-0.50 x10⁹/L');
    console.log('   New range: 0.02-0.80 x10⁹/L\n');

    const eosaResults = await resultModel.find({ testCode: 'EOSA' }).lean();
    console.log(`   Total EOSA results: ${eosaResults.length}`);

    let eosaAdultCount = 0;
    let eosaPotentiallyAffected = 0;
    const eosaAffectedDetails: any[] = [];

    for (const result of eosaResults) {
      const order = await resultModel.findOne({ _id: result._id }).populate('orderId').lean();
      if (!order || !order.orderId) continue;

      const patient = await patientModel.findById((order.orderId as any).patientId).lean();
      if (!patient) continue;

      const age = patient.age || 0;

      // Check if adult (age >= 13)
      if (age >= 13) {
        eosaAdultCount++;
        
        const value = parseFloat(result.value);
        if (!isNaN(value)) {
          // Check if value falls in the changed range
          // Old: 0.00-0.50, New: 0.02-0.80
          // Potentially affected: 0.00-0.01 (was normal, now low) or 0.51-0.80 (was high, now normal)
          if ((value >= 0.00 && value < 0.02) || (value > 0.50 && value <= 0.80)) {
            eosaPotentiallyAffected++;
            eosaAffectedDetails.push({
              resultId: result._id,
              patientAge: age,
              value: value,
              currentFlag: result.flag,
              referenceRange: result.referenceRange,
              reason: value < 0.02 ? 'Was NORMAL, now LOW' : 'Was HIGH, now NORMAL'
            });
          }
        }
      }
    }

    console.log(`   Adult EOSA results: ${eosaAdultCount}`);
    console.log(`   Potentially affected (flag change): ${eosaPotentiallyAffected}`);
    
    if (eosaAffectedDetails.length > 0) {
      console.log('\n   Affected results details:');
      eosaAffectedDetails.slice(0, 10).forEach((detail, idx) => {
        console.log(`   ${idx + 1}. Value: ${detail.value}, Current flag: ${detail.currentFlag}, ${detail.reason}`);
      });
      if (eosaAffectedDetails.length > 10) {
        console.log(`   ... and ${eosaAffectedDetails.length - 10} more`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('IMPACT SUMMARY');
    console.log('='.repeat(70));
    console.log(`\nTotal potentially affected results: ${wbcPotentiallyAffected + eosaPotentiallyAffected}`);
    console.log(`  - WBC (adult males): ${wbcPotentiallyAffected}`);
    console.log(`  - EOSA (adults): ${eosaPotentiallyAffected}`);

    console.log('\n📌 IMPORTANT NOTES:');
    console.log('1. Existing results store their reference range at the time of creation');
    console.log('2. The stored flag (normal/high/low) was calculated using the OLD ranges');
    console.log('3. These flags will NOT automatically update - they are historical records');
    console.log('4. NEW results will use the updated ranges and calculate flags correctly');
    console.log('5. Reports generated from old results will show the OLD reference ranges');
    console.log('\n💡 RECOMMENDATION:');
    if (wbcPotentiallyAffected + eosaPotentiallyAffected > 0) {
      console.log('   Consider if you need to recalculate flags for affected results.');
      console.log('   This is typically NOT necessary as results are historical records.');
      console.log('   The old ranges were valid at the time the test was performed.');
    } else {
      console.log('   No results are affected by the range changes.');
      console.log('   All existing results remain valid with their current flags.');
    }

  } catch (error) {
    console.error('❌ Error analyzing impact:', error);
    throw error;
  } finally {
    await app.close();
  }
}

analyzeImpact()
  .then(() => {
    console.log('\n✅ Analysis completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Analysis failed:', error);
    process.exit(1);
  });
