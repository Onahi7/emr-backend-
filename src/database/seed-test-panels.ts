import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestPanel } from './schemas/test-panel.schema';
import { TestCatalog } from './schemas/test-catalog.schema';

async function seedTestPanels() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const testPanelModel = app.get<Model<TestPanel>>('TestPanelModel');
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('Starting test panels seeding...');

  // Clear existing test panels
  await testPanelModel.deleteMany({});
  console.log('Cleared existing test panels');

  // Helper function to get test ID by code
  const getTestByCode = async (code: string) => {
    const test = await testCatalogModel.findOne({ code });
    if (!test) {
      console.warn(`Warning: Test ${code} not found in catalog`);
      return null;
    }
    return test;
  };

  const panels = [];

  // ==================== FBC (FULL BLOOD COUNT) ====================
  // Order matches Zybio ZS-2 analyzer top-to-bottom output
  const fbcTests = [
    'WBC',
    'NEUTA', 'LYMPHA', 'MONOA', 'EOSA', 'BASOA',   // absolute # counts
    'NEUT',  'LYMPH',  'MONO',  'EOS',  'BASO',    // differential %
    'RBC', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDWCV', 'RDWSD',
    'PLT', 'MPV', 'PDW', 'PLTCT', 'PLCC', 'PLCR',
  ];
  const fbcTestItems = [];
  
  for (const code of fbcTests) {
    const test = await getTestByCode(code);
    if (test) {
      fbcTestItems.push({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      });
    }
  }

  panels.push({
    code: 'FBC',
    name: 'Full Blood Count',
    description: 'Complete blood count with differential and platelet/RBC indices',
    price: 150,
    isActive: true,
    tests: fbcTestItems,
  });

  // ==================== ELECTROLYTE PANEL ====================
  const electTests = ['K', 'NA', 'CL', 'ICA', 'NCA', 'TCA', 'TCO2', 'PH'];
  const electTestItems = [];
  
  for (const code of electTests) {
    const test = await getTestByCode(code);
    if (test) {
      electTestItems.push({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      });
    }
  }

  panels.push({
    code: 'ELEC',
    name: 'Electrolyte Panel',
    description: 'Complete electrolyte panel - K, Na, Cl, iCa, nCa, TCa, TCO2, Blood pH',
    price: 190,
    isActive: true,
    tests: electTestItems,
  });

  // ==================== LIVER FUNCTION TEST (LFT) ====================
  const lftTests = ['ALT', 'AST', 'ALP', 'ALB', 'TBIL', 'DBIL', 'GGT', 'TP'];
  const lftTestItems = [];
  
  for (const code of lftTests) {
    const test = await getTestByCode(code);
    if (test) {
      lftTestItems.push({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      });
    }
  }

  panels.push({
    code: 'LFT',
    name: 'Liver Function Test',
    description: 'Comprehensive liver function panel - ALT, AST, ALP, Albumin, Bilirubin, GGT, Total Protein',
    price: 320,
    isActive: true,
    tests: lftTestItems,
  });

  // ==================== RENAL FUNCTION TEST (RFT) ====================
  const rftTests = ['UREA', 'CREAT', 'NA', 'K', 'CL', 'HCO3', 'UA'];
  const rftTestItems = [];
  
  for (const code of rftTests) {
    const test = await getTestByCode(code);
    if (test) {
      rftTestItems.push({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      });
    }
  }

  panels.push({
    code: 'RFT',
    name: 'Renal Function Test',
    description: 'Kidney function panel - Urea, Creatinine, Electrolytes, Uric Acid',
    price: 390, // Sum: UREA(80) + CREAT(90) + NA(35) + K(35) + CL(35) + HCO3(35) + UA(80)
    isActive: true,
    tests: rftTestItems,
  });

  // ==================== LIPID PROFILE ====================
  const lipidTests = ['CHOL', 'TG', 'HDL', 'LDL', 'VLDL'];
  const lipidTestItems = [];
  
  for (const code of lipidTests) {
    const test = await getTestByCode(code);
    if (test) {
      lipidTestItems.push({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      });
    }
  }

  panels.push({
    code: 'LIPID',
    name: 'Lipid Profile',
    description: 'Complete lipid panel - Total Cholesterol, Triglycerides, HDL, LDL, VLDL',
    price: 430, // Sum: CHOL(80) + TG(80) + HDL(120) + LDL(150)
    isActive: true,
    tests: lipidTestItems,
  });

  // ==================== COAGULATION PROFILE ====================
  const coagTests = ['PT', 'APTT', 'INR'];
  const coagTestItems = [];

  for (const code of coagTests) {
    const test = await getTestByCode(code);
    if (test) {
      coagTestItems.push({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      });
    }
  }

  panels.push({
    code: 'COAG',
    name: 'Coagulation Profile',
    description: 'Coagulation screen - Prothrombin Time, APTT, INR',
    price: 525, // PT(175) + APTT(175) + INR(175)
    isActive: true,
    tests: coagTestItems,
  });

  // ==================== URINALYSIS ====================
  const urineTests = ['URINE-COLOR', 'URINE-CLARITY', 'URINE-PH', 'URINE-SG', 'URINE-PROTEIN', 
                      'URINE-GLUCOSE', 'URINE-KETONES', 'URINE-BLOOD', 'URINE-BILI', 
                      'URINE-URO', 'URINE-NITRITE', 'URINE-LE', 'URINE-RBC', 'URINE-WBC', 
                      'URINE-EPI', 'URINE-CASTS', 'URINE-CRYSTALS', 'URINE-BACTERIA'];
  const urineTestItems = [];
  
  for (const code of urineTests) {
    const test = await getTestByCode(code);
    if (test) {
      urineTestItems.push({
        testId: test._id,
        testCode: test.code,
        testName: test.name,
      });
    }
  }
  
  panels.push({
    code: 'URINE',
    name: 'Urinalysis',
    description: 'Complete urinalysis - Physical, Chemical, and Microscopic examination',
    price: 90,
    isActive: true,
    tests: urineTestItems,
  });

  // Insert all panels
  const result = await testPanelModel.insertMany(panels);
  console.log(`\n✅ Successfully seeded ${result.length} test panels:`);
  
  result.forEach(panel => {
    console.log(`   - ${panel.code}: ${panel.name} (${panel.tests.length} tests)`);
    if (panel.tests.length > 0) {
      console.log(`     Tests: ${panel.tests.map(t => t.testCode).join(', ')}`);
    }
  });

  console.log('\n📊 Panel Summary:');
  console.log(`   FBC: ${fbcTestItems.length} parameters`);
  console.log(`   ELEC: ${electTestItems.length} parameters`);
  console.log(`   LFT: ${lftTestItems.length} parameters`);
  console.log(`   RFT: ${rftTestItems.length} parameters`);
  console.log(`   LIPID: ${lipidTestItems.length} parameters`);
  console.log(`   COAG: ${coagTestItems.length} parameters`);
  console.log(`   URINE: ${urineTestItems.length} parameters`);

  await app.close();
  console.log('\n✅ Test panels seeding completed successfully');
}

seedTestPanels()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error seeding test panels:', error);
    process.exit(1);
  });
