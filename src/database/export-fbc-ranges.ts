import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Export all FBC reference ranges to a JSON file for review
 */
async function exportFBCRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('Exporting FBC reference ranges...\n');

  try {
    const fbcTests = [
      'WBC', 'NEUTA', 'LYMPHA', 'MONOA', 'EOSA', 'BASOA',
      'NEUT', 'LYMPH', 'MONO', 'EOS', 'BASO',
      'RBC', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC',
      'RDWCV', 'RDWSD', 'PLT', 'MPV', 'PDW', 'PLTCT', 'PLCR', 'PLCC'
    ];

    const tests = await testCatalogModel.find({ code: { $in: fbcTests } })
      .select('code name unit isActive referenceRange referenceRanges')
      .lean();

    // Sort by code
    tests.sort((a, b) => {
      const order = fbcTests.indexOf(a.code) - fbcTests.indexOf(b.code);
      return order;
    });

    // Write to JSON file
    const outputPath = path.join(__dirname, '../../FBC_RANGES_EXPORT.json');
    fs.writeFileSync(outputPath, JSON.stringify(tests, null, 2));

    console.log(`✅ Exported ${tests.length} FBC tests to: FBC_RANGES_EXPORT.json\n`);

    // Create a readable markdown summary
    let markdown = '# FBC Reference Ranges - Current State\n\n';
    markdown += `Generated: ${new Date().toISOString()}\n\n`;
    markdown += '---\n\n';

    tests.forEach(test => {
      markdown += `## ${test.code} - ${test.name}\n\n`;
      markdown += `- **Unit:** ${test.unit || 'N/A'}\n`;
      markdown += `- **Active:** ${test.isActive ? 'Yes' : 'No'}\n\n`;

      if (test.referenceRange) {
        markdown += `**Simple Range:** ${test.referenceRange}\n\n`;
      }

      if (test.referenceRanges && test.referenceRanges.length > 0) {
        markdown += '**Age/Gender-Specific Ranges:**\n\n';
        markdown += '| Age Group | Age Range | Gender | Range | Critical Low | Critical High |\n';
        markdown += '|-----------|-----------|--------|-------|--------------|---------------|\n';

        test.referenceRanges.forEach((range: any) => {
          const ageRange = `${range.ageMin !== undefined ? range.ageMin : '0'}${range.ageMax !== undefined ? ` - ${range.ageMax}` : '+'} years`;
          const critLow = range.criticalLow || '-';
          const critHigh = range.criticalHigh || '-';
          markdown += `| ${range.ageGroup || 'Unspecified'} | ${ageRange} | ${range.gender || 'all'} | ${range.range} ${range.unit || test.unit || ''} | ${critLow} | ${critHigh} |\n`;
        });
        markdown += '\n';
      } else {
        markdown += '⚠️ **No age/gender-specific ranges defined**\n\n';
      }

      markdown += '---\n\n';
    });

    const mdPath = path.join(__dirname, '../../FBC_RANGES_CURRENT.md');
    fs.writeFileSync(mdPath, markdown);

    console.log(`✅ Created readable summary: FBC_RANGES_CURRENT.md\n`);

  } catch (error) {
    console.error('❌ Error exporting FBC ranges:', error);
    throw error;
  } finally {
    await app.close();
  }
}

exportFBCRanges()
  .then(() => {
    console.log('✅ Export completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Export failed:', error);
    process.exit(1);
  });
