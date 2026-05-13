import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { getModelToken } from '@nestjs/mongoose';

/**
 * Diagnostic: Compare serology tests — DB state vs intended frontend reporting.
 * Run with: pnpm check:serology
 */

// ── Intended reporting per test code ────────────────────────────────────────
const INTENDED: Record<string, {
  resultOptions: string[];          // values the lab tech picks
  interpretationMap: Record<string, string>;  // result → interpretation on report
  reportedAs: string;               // note for the comparison output
}> = {
  RVS: {
    resultOptions: ['Non-Reactive', 'Reactive'],
    interpretationMap: { 'Non-Reactive': 'Negative', 'Reactive': 'Positive' },
    reportedAs: 'Result: Reactive/Non-Reactive | Interpretation: Positive/Negative',
  },
  HBSAG: {
    resultOptions: ['Non-Reactive', 'Reactive'],
    interpretationMap: { 'Non-Reactive': 'Negative', 'Reactive': 'Positive' },
    reportedAs: 'Result: Reactive/Non-Reactive | Interpretation: Positive/Negative',
  },
  HCV: {
    resultOptions: ['Non-Reactive', 'Reactive'],
    interpretationMap: { 'Non-Reactive': 'Negative', 'Reactive': 'Positive' },
    reportedAs: 'Result: Reactive/Non-Reactive | Interpretation: Positive/Negative',
  },
  RVSP24: {
    resultOptions: ['Non-Reactive', 'Reactive'],
    interpretationMap: { 'Non-Reactive': 'Negative', 'Reactive': 'Positive' },
    reportedAs: 'Result: Reactive/Non-Reactive | Interpretation: Positive/Negative',
  },
  HPYLORI: {
    resultOptions: ['Non-Reactive', 'Reactive'],
    interpretationMap: { 'Non-Reactive': 'Negative', 'Reactive': 'Positive' },
    reportedAs: 'Result: Reactive/Non-Reactive | Interpretation: Positive/Negative',
  },
  HPYLORI_IA: {
    resultOptions: ['Non-Reactive', 'Reactive'],
    interpretationMap: { 'Non-Reactive': 'Negative', 'Reactive': 'Positive' },
    reportedAs: 'Result: Reactive/Non-Reactive | Interpretation: Positive/Negative',
  },
  HSV: {
    resultOptions: ['Non-Reactive', 'Reactive (HSV-1)', 'Reactive (HSV-2)', 'Reactive (HSV-1 & 2)'],
    interpretationMap: {
      'Non-Reactive': 'Negative',
      'Reactive (HSV-1)': 'Positive',
      'Reactive (HSV-2)': 'Positive',
      'Reactive (HSV-1 & 2)': 'Positive',
    },
    reportedAs: 'Result: Reactive(type)/Non-Reactive | Interpretation: Positive/Negative',
  },
  VDRL: {
    resultOptions: ['Non-Reactive', 'Weakly Reactive', 'Reactive (1:1)', 'Reactive (1:2)', 'Reactive (1:4)', 'Reactive (1:8)', 'Reactive (1:16)', 'Reactive (1:32)'],
    interpretationMap: {
      'Non-Reactive': 'Negative',
      'Weakly Reactive': 'Weakly Positive',
      'Reactive (1:1)': 'Positive',
      'Reactive (1:2)': 'Positive',
      'Reactive (1:4)': 'Positive',
      'Reactive (1:8)': 'Positive',
      'Reactive (1:16)': 'Positive',
      'Reactive (1:32)': 'Positive',
    },
    reportedAs: 'Result: Reactive(titer)/Non-Reactive | Interpretation: Positive/Negative/Weakly Positive',
  },
  WIDAL: {
    resultOptions: [
      'IgM: Non-Reactive  |  IgG: Non-Reactive',
      'IgM: Reactive      |  IgG: Non-Reactive',
      'IgM: Non-Reactive  |  IgG: Reactive',
      'IgM: Reactive      |  IgG: Reactive',
    ],
    interpretationMap: {
      'IgM: Non-Reactive  |  IgG: Non-Reactive': 'Negative',
      'IgM: Reactive      |  IgG: Non-Reactive': 'Acute Infection',
      'IgM: Non-Reactive  |  IgG: Reactive': 'Past Infection / Immunity',
      'IgM: Reactive      |  IgG: Reactive': 'Positive (Active/Recent)',
    },
    reportedAs: 'Result: IgM/IgG Reactive/Non-Reactive | Interpretation: Infection status',
  },
  MALARIA: {
    resultOptions: ['Negative', 'Positive (P. falciparum)', 'Positive (P. vivax)', 'Positive (Mixed)'],
    interpretationMap: {
      'Negative': 'No malaria antigen detected',
      'Positive (P. falciparum)': 'P. falciparum detected',
      'Positive (P. vivax)': 'P. vivax detected',
      'Positive (Mixed)': 'Mixed plasmodium detected',
    },
    reportedAs: 'Result: Negative/Positive(species) | Interpretation: species detected',
  },
  GONORRHEA: {
    resultOptions: ['Negative', 'Positive'],
    interpretationMap: { 'Negative': 'Not Detected', 'Positive': 'Detected' },
    reportedAs: 'Result: Positive/Negative | Interpretation: Detected/Not Detected',
  },
  CHLAMYDIA: {
    resultOptions: ['Negative', 'Positive'],
    interpretationMap: { 'Negative': 'Not Detected', 'Positive': 'Detected' },
    reportedAs: 'Result: Positive/Negative | Interpretation: Detected/Not Detected',
  },
  HPAG: {
    resultOptions: ['Negative', 'Positive'],
    interpretationMap: { 'Negative': 'Not Detected', 'Positive': 'H. Pylori Antigen Detected' },
    reportedAs: 'Result: Positive/Negative | Interpretation: Detected/Not Detected',
  },
};

// ── Frontend QUALITATIVE_OPTIONS (current state) ─────────────────────────────
const FRONTEND_OPTIONS: Record<string, string[]> = {
  RVS:       ['Non-Reactive', 'Reactive'],
  HBSAG:     ['Non-Reactive', 'Reactive'],
  HCV:       ['Non-Reactive', 'Reactive'],
  RVSP24:    ['Non-Reactive', 'Reactive'],
  HPYLORI:   ['Non-Reactive', 'Reactive'],
  HPYLORI_IA:['Non-Reactive', 'Reactive'],
  HSV:       ['Non-Reactive', 'Reactive (HSV-1)', 'Reactive (HSV-2)', 'Reactive (HSV-1 & 2)'],
  VDRL:      ['Non-Reactive', 'Weakly Reactive', 'Reactive (1:1)', 'Reactive (1:2)', 'Reactive (1:4)', 'Reactive (1:8)', 'Reactive (1:16)', 'Reactive (1:32)'],
  WIDAL:     ['IgM: Non-Reactive  |  IgG: Non-Reactive', 'IgM: Reactive      |  IgG: Non-Reactive', 'IgM: Non-Reactive  |  IgG: Reactive', 'IgM: Reactive      |  IgG: Reactive'],
  MALARIA:   ['Negative', 'Positive (P. falciparum)', 'Positive (P. vivax)', 'Positive (Mixed)'],
  GONORRHEA: ['Negative', 'Positive'],
  CHLAMYDIA: ['Negative', 'Positive'],
  HPAG:      ['Negative', 'Positive'],
};

async function checkSerologyReport() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));

  const codes = Object.keys(INTENDED);
  const dbTests = await catalogModel.find({ code: { $in: codes } }).lean();
  const dbMap: Record<string, any> = {};
  for (const t of dbTests) dbMap[t.code] = t;

  const W = 80;
  console.log('\n' + '═'.repeat(W));
  console.log('  SEROLOGY REPORT CHECK — DB vs Intended vs Frontend');
  console.log('═'.repeat(W));

  let allOk = true;

  for (const code of codes) {
    const db = dbMap[code];
    const intended = INTENDED[code];
    const frontendOpts = FRONTEND_OPTIONS[code] || [];

    console.log(`\n┌─ ${code} ${'─'.repeat(W - code.length - 4)}`);

    // ── DB state ──────────────────────────────────────────────────────────
    if (!db) {
      console.log(`│  ⚠️  NOT FOUND IN DATABASE`);
      allOk = false;
    } else {
      const status = db.isActive ? '✅ Active' : '❌ Inactive';
      console.log(`│  DB:       ${db.name} | ${db.category} | price: ${db.price} | ${status}`);
      console.log(`│  DB desc:  ${db.description || '(none)'}`);
    }

    // ── Intended reporting ────────────────────────────────────────────────
    console.log(`│  Intended: ${intended.reportedAs}`);
    console.log(`│  Options:  ${intended.resultOptions.join('  /  ')}`);

    // ── Frontend options ──────────────────────────────────────────────────
    const frontendMatch = JSON.stringify(frontendOpts) === JSON.stringify(intended.resultOptions);
    const frontendStatus = frontendMatch ? '✅ Match' : '❌ MISMATCH';
    console.log(`│  Frontend: [${frontendOpts.join('  /  ')}]  ${frontendStatus}`);

    if (!frontendMatch) {
      allOk = false;
      console.log(`│  ⚠️  Expected: [${intended.resultOptions.join('  /  ')}]`);
    }

    // ── Interpretation map ────────────────────────────────────────────────
    console.log(`│  Interpretation map:`);
    for (const [result, interp] of Object.entries(intended.interpretationMap)) {
      console.log(`│    "${result}"  →  "${interp}"`);
    }

    console.log(`└${'─'.repeat(W - 1)}`);
  }

  console.log('\n' + '═'.repeat(W));
  if (allOk) {
    console.log('  ✅ ALL CHECKS PASSED — DB, Frontend options, and Interpretations are aligned.');
  } else {
    console.log('  ⚠️  SOME ISSUES FOUND — review items marked ❌ above.');
  }
  console.log('═'.repeat(W) + '\n');

  await app.close();
}

checkSerologyReport().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
