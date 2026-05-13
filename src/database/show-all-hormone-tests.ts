import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';

/**
 * Display all hormone tests with their complete reference ranges
 */
async function showAllHormoneTests() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<any>>('TestCatalogModel');

  console.log('\n' + '='.repeat(80));
  console.log('COMPLETE HORMONE TEST CATALOG');
  console.log('='.repeat(80) + '\n');

  try {
    const hormoneTests = await testCatalogModel.find({
      code: { $in: ['E2', 'ESTRADIOL', 'FSH', 'LH', 'PROG', 'PROGESTERONE', 'AMH', 'PROLACTIN'] }
    }).sort({ code: 1 });

    if (hormoneTests.length === 0) {
      console.log('❌ No hormone tests found in catalog\n');
      return;
    }

    for (const test of hormoneTests) {
      console.log('┌' + '─'.repeat(78) + '┐');
      console.log(`│ ${test.code.padEnd(76)} │`);
      console.log(`│ ${test.name.padEnd(76)} │`);
      console.log('├' + '─'.repeat(78) + '┤');
      console.log(`│ Category: ${(test.category || 'N/A').padEnd(65)} │`);
      console.log(`│ Unit: ${(test.unit || 'N/A').padEnd(69)} │`);
      console.log(`│ Price: ${(test.price ? `${test.price} SLL` : 'N/A').padEnd(68)} │`);
      console.log(`│ Active: ${(test.isActive ? 'Yes' : 'No').padEnd(67)} │`);
      console.log('├' + '─'.repeat(78) + '┤');
      
      if (test.referenceRanges && test.referenceRanges.length > 0) {
        console.log(`│ Reference Ranges: ${test.referenceRanges.length} range(s)`.padEnd(77) + ' │');
        console.log('│' + ' '.repeat(78) + '│');
        
        test.referenceRanges.forEach((range: any, index: number) => {
          const rangeNum = `${index + 1}.`.padStart(3);
          const ageGroup = range.ageGroup || 'N/A';
          const rangeValue = range.range || 'N/A';
          const unit = range.unit || test.unit || '';
          const gender = range.gender ? ` (${range.gender})` : '';
          
          console.log(`│   ${rangeNum} ${ageGroup}${gender}`.padEnd(77) + ' │');
          console.log(`│       Range: ${rangeValue} ${unit}`.padEnd(77) + ' │');
          
          if (range.ageMin !== undefined || range.ageMax !== undefined) {
            const ageRange = `Age: ${range.ageMin || '0'}-${range.ageMax || '∞'}`;
            console.log(`│       ${ageRange}`.padEnd(77) + ' │');
          }
          
          if (range.criticalLow || range.criticalHigh) {
            const critical = `Critical: ${range.criticalLow || 'N/A'} - ${range.criticalHigh || 'N/A'}`;
            console.log(`│       ${critical}`.padEnd(77) + ' │');
          }
          
          if (index < test.referenceRanges.length - 1) {
            console.log('│' + ' '.repeat(78) + '│');
          }
        });
      } else {
        console.log('│ Reference Ranges: None defined'.padEnd(77) + ' │');
      }
      
      console.log('└' + '─'.repeat(78) + '┘\n');
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80) + '\n');
    
    console.log(`Total Hormone Tests: ${hormoneTests.length}\n`);
    
    const testsWithPhases = hormoneTests.filter((t: any) => 
      t.referenceRanges && t.referenceRanges.some((r: any) => 
        r.ageGroup && (
          r.ageGroup.toLowerCase().includes('follicular') ||
          r.ageGroup.toLowerCase().includes('ovulation') ||
          r.ageGroup.toLowerCase().includes('luteal')
        )
      )
    );
    
    console.log('Tests with Phase-Specific Ranges:');
    testsWithPhases.forEach((t: any) => {
      const phaseCount = t.referenceRanges.filter((r: any) => 
        r.ageGroup && (
          r.ageGroup.toLowerCase().includes('follicular') ||
          r.ageGroup.toLowerCase().includes('ovulation') ||
          r.ageGroup.toLowerCase().includes('luteal') ||
          r.ageGroup.toLowerCase().includes('menopause') ||
          r.ageGroup.toLowerCase().includes('pregnancy')
        )
      ).length;
      console.log(`  ✅ ${t.code} - ${phaseCount} phase-specific ranges`);
    });
    
    console.log('\nTests without Phase-Specific Ranges:');
    const testsWithoutPhases = hormoneTests.filter((t: any) => !testsWithPhases.includes(t));
    testsWithoutPhases.forEach((t: any) => {
      console.log(`  📊 ${t.code} - ${t.referenceRanges?.length || 0} ranges (age/gender based)`);
    });

    console.log('\n✅ Hormone test catalog display complete!\n');

  } catch (error) {
    console.error('❌ Error displaying hormone tests:', error);
    throw error;
  } finally {
    await app.close();
  }
}

showAllHormoneTests()
  .then(() => {
    console.log('🎉 Display completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Display failed:', error);
    process.exit(1);
  });
