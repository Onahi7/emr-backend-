import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

/**
 * This script checks test components, reference ranges, and age/gender logic
 */

async function checkTestRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const testPanelModel = app.get<Model<TestPanel>>('TestPanelModel');

  console.log('\n' + '='.repeat(100));
  console.log('TEST COMPONENTS, RANGES & AGE/GENDER LOGIC VALIDATION');
  console.log('='.repeat(100));

  // Get all panels
  const panels = await testPanelModel.find({}).lean();

  console.log(`\n📊 Found ${panels.length} panels in database\n`);

  for (const panel of panels) {
    console.log('='.repeat(100));
    console.log(`🔬 PANEL: ${panel.code} - ${panel.name}`);
    console.log(`   Price: ₦${panel.price} | Active: ${panel.isActive ? '✓' : '✗'}`);
    console.log(`   Components: ${panel.tests.length} tests`);
    console.log('='.repeat(100));

    if (panel.tests.length === 0) {
      console.log('   ⚠️  WARNING: Panel has no components!\n');
      continue;
    }

    // Check each component
    for (let i = 0; i < panel.tests.length; i++) {
      const component = panel.tests[i];
      console.log(`\n   ${i + 1}. ${component.testCode} - ${component.testName}`);

      // Find the test in catalog
      const catalogTest = await testCatalogModel.findOne({ code: component.testCode }).lean();

      if (!catalogTest) {
        console.log(`      ❌ ERROR: Test ${component.testCode} not found in catalog!`);
        continue;
      }

      // Check test details
      console.log(`      ├─ Price: ₦${catalogTest.price} | Active: ${catalogTest.isActive ? '✓' : '✗'}`);
      console.log(`      ├─ Category: ${catalogTest.category}`);
      console.log(`      ├─ Sample: ${catalogTest.sampleType} | TAT: ${catalogTest.turnaroundTime}min`);
      
      if (catalogTest.unit) {
        console.log(`      ├─ Unit: ${catalogTest.unit}`);
      }

      // Check reference ranges
      if (!catalogTest.referenceRanges || catalogTest.referenceRanges.length === 0) {
        console.log(`      └─ ⚠️  WARNING: No reference ranges defined!`);
        continue;
      }

      console.log(`      └─ Reference Ranges: ${catalogTest.referenceRanges.length} range(s)`);

      // Analyze reference ranges
      const ranges = catalogTest.referenceRanges;
      
      // Check for age coverage
      const ageGroups = new Set<string>();
      const genders = new Set<string>();
      const hasPregnancy = ranges.some((r: any) => r.pregnancy);
      const hasConditions = ranges.some((r: any) => r.condition);
      const hasCriticalValues = ranges.some((r: any) => r.criticalLow || r.criticalHigh);

      ranges.forEach((range: any) => {
        ageGroups.add(range.ageGroup);
        if (range.gender) genders.add(range.gender);
      });

      console.log(`         ├─ Age Groups: ${ageGroups.size} (${Array.from(ageGroups).join(', ')})`);
      console.log(`         ├─ Genders: ${Array.from(genders).join(', ') || 'all'}`);
      
      if (hasPregnancy) {
        console.log(`         ├─ ✓ Has pregnancy-specific ranges`);
      }
      
      if (hasConditions) {
        const conditions = ranges
          .filter((r: any) => r.condition)
          .map((r: any) => r.condition);
        console.log(`         ├─ ✓ Has condition-specific ranges: ${[...new Set(conditions)].join(', ')}`);
      }
      
      if (hasCriticalValues) {
        console.log(`         ├─ ✓ Has critical value thresholds`);
      }

      // Display detailed ranges
      console.log(`         └─ Detailed Ranges:`);
      ranges.forEach((range: any, idx: number) => {
        let rangeStr = `            ${idx + 1}. ${range.ageGroup}`;
        
        if (range.ageMin !== undefined || range.ageMax !== undefined) {
          rangeStr += ` [Age: `;
          if (range.ageMin !== undefined) rangeStr += `${range.ageMin}`;
          if (range.ageMin !== undefined && range.ageMax !== undefined) rangeStr += `-`;
          if (range.ageMax !== undefined) rangeStr += `${range.ageMax}`;
          rangeStr += ` years]`;
        }
        
        if (range.gender && range.gender !== 'all') {
          rangeStr += ` (${range.gender === 'M' ? 'Male' : 'Female'})`;
        }
        
        if (range.pregnancy) {
          rangeStr += ` [PREGNANCY]`;
        }
        
        if (range.condition) {
          rangeStr += ` [${range.condition}]`;
        }
        
        rangeStr += `\n               Range: ${range.range} ${range.unit}`;
        
        if (range.criticalLow || range.criticalHigh) {
          rangeStr += `\n               Critical: `;
          if (range.criticalLow) rangeStr += `Low <${range.criticalLow}`;
          if (range.criticalLow && range.criticalHigh) rangeStr += `, `;
          if (range.criticalHigh) rangeStr += `High >${range.criticalHigh}`;
        }
        
        console.log(rangeStr);
      });
    }

    console.log('\n');
  }

  // Summary of issues
  console.log('='.repeat(100));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(100));

  let totalComponents = 0;
  let missingTests = 0;
  let noRanges = 0;
  let inactiveComponents = 0;

  for (const panel of panels) {
    totalComponents += panel.tests.length;
    
    for (const component of panel.tests) {
      const catalogTest = await testCatalogModel.findOne({ code: component.testCode }).lean();
      
      if (!catalogTest) {
        missingTests++;
      } else {
        if (!catalogTest.isActive) {
          inactiveComponents++;
        }
        if (!catalogTest.referenceRanges || catalogTest.referenceRanges.length === 0) {
          noRanges++;
        }
      }
    }
  }

  console.log(`\n✓ Total panel components: ${totalComponents}`);
  
  if (missingTests > 0) {
    console.log(`❌ Missing from catalog: ${missingTests}`);
  } else {
    console.log(`✓ All components found in catalog`);
  }
  
  if (inactiveComponents > 0) {
    console.log(`⚠️  Inactive components: ${inactiveComponents}`);
  } else {
    console.log(`✓ All components are active`);
  }
  
  if (noRanges > 0) {
    console.log(`⚠️  Components without ranges: ${noRanges}`);
  } else {
    console.log(`✓ All components have reference ranges`);
  }

  // Check age logic implementation
  console.log('\n' + '='.repeat(100));
  console.log('AGE/GENDER LOGIC EXAMPLES');
  console.log('='.repeat(100));

  // Test scenarios
  const scenarios = [
    { age: 0.01, gender: 'M', description: 'Newborn (3 days old)' },
    { age: 5, gender: 'F', description: '5-year-old girl' },
    { age: 15, gender: 'M', description: '15-year-old boy' },
    { age: 25, gender: 'F', description: '25-year-old woman' },
    { age: 25, gender: 'F', pregnancy: true, description: '25-year-old pregnant woman' },
    { age: 45, gender: 'M', description: '45-year-old man' },
    { age: 70, gender: 'F', description: '70-year-old woman' },
  ];

  // Test with Hemoglobin (HB) as example
  const hbTest = await testCatalogModel.findOne({ code: 'HB' }).lean();
  
  if (hbTest && hbTest.referenceRanges) {
    console.log(`\n📋 Example: ${hbTest.code} - ${hbTest.name}`);
    console.log(`   Unit: ${hbTest.unit}\n`);

    for (const scenario of scenarios) {
      console.log(`   Scenario: ${scenario.description}`);
      console.log(`   Age: ${scenario.age} years, Gender: ${scenario.gender}${scenario.pregnancy ? ', Pregnant' : ''}`);
      
      // Find matching range
      const matchingRange = findMatchingRange(hbTest.referenceRanges, scenario.age, scenario.gender, scenario.pregnancy);
      
      if (matchingRange) {
        console.log(`   ✓ Matched Range: ${matchingRange.ageGroup}`);
        console.log(`     Reference: ${matchingRange.range} ${matchingRange.unit}`);
        if (matchingRange.criticalLow || matchingRange.criticalHigh) {
          console.log(`     Critical: Low <${matchingRange.criticalLow || 'N/A'}, High >${matchingRange.criticalHigh || 'N/A'}`);
        }
      } else {
        console.log(`   ❌ No matching range found!`);
      }
      console.log('');
    }
  }

  console.log('='.repeat(100));
  console.log('END OF VALIDATION');
  console.log('='.repeat(100) + '\n');

  await app.close();
}

// Helper function to find matching reference range
function findMatchingRange(ranges: any[], age: number, gender: string, pregnancy?: boolean): any {
  // First, try to find pregnancy-specific range if applicable
  if (pregnancy && gender === 'F') {
    const pregnancyRange = ranges.find((r: any) => r.pregnancy === true);
    if (pregnancyRange) return pregnancyRange;
  }

  // Then find age and gender specific range
  for (const range of ranges) {
    // Check age match
    const ageMatch = 
      (range.ageMin === undefined || age >= range.ageMin) &&
      (range.ageMax === undefined || age <= range.ageMax);
    
    // Check gender match
    const genderMatch = 
      !range.gender || 
      range.gender === 'all' || 
      range.gender === gender;
    
    if (ageMatch && genderMatch && !range.pregnancy) {
      return range;
    }
  }

  // Fallback to 'all ages' or 'all genders' range
  return ranges.find((r: any) => 
    (!r.ageMin && !r.ageMax) || 
    r.gender === 'all' || 
    !r.gender
  );
}

checkTestRanges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error checking test ranges:', error);
    process.exit(1);
  });
