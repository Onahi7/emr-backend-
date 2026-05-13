import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function listAllTests() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const testPanelModel = app.get<Model<TestPanel>>('TestPanelModel');

  console.log('\n' + '='.repeat(100));
  console.log('COMPLETE TEST CATALOG & PANEL DATABASE LISTING');
  console.log('='.repeat(100));

  // Get all tests sorted by category and code
  const allTests = await testCatalogModel.find({}).sort({ category: 1, code: 1 }).lean();
  const allPanels = await testPanelModel.find({}).lean();

  console.log(`\nTotal Tests in Catalog: ${allTests.length}`);
  console.log(`Total Panels: ${allPanels.length}`);

  // Group tests by category
  const testsByCategory = allTests.reduce((acc, test) => {
    if (!acc[test.category]) {
      acc[test.category] = [];
    }
    acc[test.category].push(test);
    return acc;
  }, {} as Record<string, any[]>);

  // Display tests by category
  for (const [category, tests] of Object.entries(testsByCategory)) {
    console.log('\n' + '='.repeat(100));
    console.log(`CATEGORY: ${category.toUpperCase()}`);
    console.log('='.repeat(100));

    for (const test of tests) {
      console.log(`\n📋 ${test.code} - ${test.name}`);
      console.log(`   Price: ₦${test.price} | Active: ${test.isActive ? '✓' : '✗'} | Sample: ${test.sampleType} | TAT: ${test.turnaroundTime}min`);
      
      if (test.unit) {
        console.log(`   Unit: ${test.unit}`);
      }
      
      if (test.description) {
        console.log(`   Description: ${test.description}`);
      }

      if (test.referenceRanges && test.referenceRanges.length > 0) {
        console.log(`   Reference Ranges (${test.referenceRanges.length} ranges):`);
        test.referenceRanges.forEach((range: any, idx: number) => {
          let rangeStr = `      ${idx + 1}. ${range.ageGroup}`;
          if (range.gender && range.gender !== 'all') {
            rangeStr += ` (${range.gender})`;
          }
          if (range.pregnancy) {
            rangeStr += ` [Pregnancy]`;
          }
          if (range.condition) {
            rangeStr += ` [${range.condition}]`;
          }
          rangeStr += `: ${range.range} ${range.unit}`;
          
          if (range.criticalLow || range.criticalHigh) {
            rangeStr += ` | Critical: `;
            if (range.criticalLow) rangeStr += `Low <${range.criticalLow}`;
            if (range.criticalLow && range.criticalHigh) rangeStr += `, `;
            if (range.criticalHigh) rangeStr += `High >${range.criticalHigh}`;
          }
          
          console.log(rangeStr);
        });
      }
    }
  }

  // Display panels
  console.log('\n' + '='.repeat(100));
  console.log('TEST PANELS');
  console.log('='.repeat(100));

  for (const panel of allPanels) {
    console.log(`\n🔬 ${panel.code} - ${panel.name}`);
    console.log(`   Price: ₦${panel.price} | Active: ${panel.isActive ? '✓' : '✗'}`);
    
    if (panel.description) {
      console.log(`   Description: ${panel.description}`);
    }

    if (panel.tests && panel.tests.length > 0) {
      console.log(`   Components (${panel.tests.length} tests):`);
      panel.tests.forEach((test: any, idx: number) => {
        console.log(`      ${idx + 1}. ${test.testCode} - ${test.testName}`);
      });

      // Calculate sum of individual test prices
      let totalIndividualPrice = 0;
      for (const test of panel.tests) {
        const catalogTest = await testCatalogModel.findOne({ code: test.testCode });
        if (catalogTest) {
          totalIndividualPrice += catalogTest.price;
        }
      }
      
      if (totalIndividualPrice > 0) {
        console.log(`   Individual Sum: ₦${totalIndividualPrice} | Panel Price: ₦${panel.price}`);
        if (totalIndividualPrice !== panel.price) {
          const savings = totalIndividualPrice - panel.price;
          console.log(`   💰 Savings: ₦${savings} (${((savings / totalIndividualPrice) * 100).toFixed(1)}% discount)`);
        } else {
          console.log(`   ℹ️  No discount (same as individual sum)`);
        }
      }
    }
  }

  // Summary statistics
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(100));

  const activeTests = allTests.filter(t => t.isActive);
  const inactiveTests = allTests.filter(t => !t.isActive);
  
  console.log(`\nTest Catalog:`);
  console.log(`   Total Tests: ${allTests.length}`);
  console.log(`   Active (individually orderable): ${activeTests.length}`);
  console.log(`   Inactive (panel-only): ${inactiveTests.length}`);

  console.log(`\nBy Category:`);
  for (const [category, tests] of Object.entries(testsByCategory)) {
    const active = tests.filter(t => t.isActive).length;
    const inactive = tests.filter(t => !t.isActive).length;
    console.log(`   ${category}: ${tests.length} tests (${active} active, ${inactive} inactive)`);
  }

  console.log(`\nPanels:`);
  console.log(`   Total Panels: ${allPanels.length}`);
  allPanels.forEach(panel => {
    console.log(`   ${panel.code}: ₦${panel.price} (${panel.tests.length} components)`);
  });

  console.log(`\nPrice Range:`);
  const prices = activeTests.map(t => t.price).filter(p => p > 0);
  if (prices.length > 0) {
    console.log(`   Minimum: ₦${Math.min(...prices)}`);
    console.log(`   Maximum: ₦${Math.max(...prices)}`);
    console.log(`   Average: ₦${(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)}`);
  }

  console.log('\n' + '='.repeat(100));
  console.log('END OF LISTING');
  console.log('='.repeat(100) + '\n');

  await app.close();
}

listAllTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error listing tests:', error);
    process.exit(1);
  });
