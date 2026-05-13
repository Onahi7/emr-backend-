import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Serology & Microscopy seed script.
 * Uses upsert so it never wipes unrelated catalog entries.
 * Run with: pnpm seed:serology
 */
async function seedSerology() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const model = app.get<Model<TestCatalog>>('TestCatalogModel');

  const tests = [
    // ==================== SEROLOGY ====================
    {
      code: 'HBSAG',
      name: 'Hepatitis B Surface Antigen',
      category: 'serology',
      price: 50,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'HBsAg rapid test — Reactive / Non-Reactive',
    },
    {
      code: 'HCV',
      name: 'Hepatitis C Antibody',
      category: 'serology',
      price: 70,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'HCV antibody rapid test — Reactive / Non-Reactive',
    },
    {
      code: 'VDRL',
      name: 'VDRL (Syphilis)',
      category: 'serology',
      price: 60,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'Syphilis screening test — titered result',
    },
    {
      code: 'HPYLORI',
      name: 'H. Pylori Rapid Test',
      category: 'serology',
      price: 100,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'Helicobacter pylori antibody rapid test — Positive / Negative',
    },
    {
      code: 'MALARIA',
      name: 'Malaria RDT',
      category: 'serology',
      price: 50,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'Rapid malaria antigen test',
    },
    {
      code: 'RVS',
      name: 'RVS Rapid Test',
      category: 'serology',
      price: 100,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'RVS antibody rapid test — Reactive / Non-Reactive',
    },
    {
      code: 'GONORRHEA',
      name: 'Gonorrhea Test',
      category: 'serology',
      price: 150,
      sampleType: 'swab',
      turnaroundTime: 60,
      isActive: true,
      description: 'Gonorrhea antigen detection — Positive / Negative',
    },
    {
      code: 'CHLAMYDIA',
      name: 'Chlamydia Test',
      category: 'serology',
      price: 150,
      sampleType: 'swab',
      turnaroundTime: 60,
      isActive: true,
      description: 'Chlamydia antigen detection — Positive / Negative',
    },
    {
      code: 'HSV',
      name: 'Herpes Simplex Virus',
      category: 'serology',
      price: 150,
      sampleType: 'blood',
      turnaroundTime: 60,
      isActive: true,
      description: 'HSV-1 / HSV-2 antibody test — Reactive / Non-Reactive',
    },
    {
      code: 'WIDAL',
      name: 'Typhoid (IgM/IgG)',
      category: 'serology',
      price: 80,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'Typhoid rapid strip test — reports S. typhi IgM and IgG separately',
    },
    {
      code: 'RVSP24',
      name: 'RVS P24 Antigen',
      category: 'serology',
      price: 150,
      sampleType: 'blood',
      turnaroundTime: 30,
      isActive: true,
      description: 'RVS P24 antigen early-detection test — Reactive / Non-Reactive',
    },

    // ==================== MICROSCOPY ====================
    {
      code: 'STOOLMICRO',
      name: 'Stool Microscopy',
      category: 'microbiology',
      price: 100,
      sampleType: 'stool',
      turnaroundTime: 120,
      isActive: true,
      description: 'Microscopic examination of stool for ova, cysts, and parasites',
    },
    {
      code: 'URINE',
      name: 'Urinalysis / Microscopy',
      category: 'urinalysis',
      price: 90,
      sampleType: 'urine',
      turnaroundTime: 60,
      isActive: true,
      description: 'Complete urine analysis with microscopy',
    },
    {
      code: 'HPAG',
      name: 'H. Pylori Antigen (Stool)',
      category: 'microbiology',
      price: 150,
      sampleType: 'stool',
      turnaroundTime: 60,
      isActive: true,
      description: 'Helicobacter pylori stool antigen detection — Positive / Negative',
    },
  ];

  let upserted = 0;
  for (const test of tests) {
    await model.findOneAndUpdate(
      { code: test.code },
      { $set: test },
      { upsert: true, new: true },
    );
    upserted++;
    console.log(`  ✅ ${test.code} — ${test.name} (${test.category}, Le ${test.price})`);
  }

  console.log(`\nSerology & Microscopy seeding complete — ${upserted} tests upserted.`);
  await app.close();
}

seedSerology()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
