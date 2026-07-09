const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamemr?retryWrites=true&w=majority&appName=Cluster0';

// ─── PROGRAMS ───
const programs = [
  {
    code: 'AIC',
    name: 'African Insurance Company',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: 'Largest program with ~95 sub-entity variants across NGO, government, and private employers.',
    isActive: true,
  },
  {
    code: 'RHIP',
    name: 'Reproductive Health Insurance Program',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: 'Health insurance program with ~85 employer sub-entities.',
    isActive: true,
  },
  {
    code: 'WAEC',
    name: 'West African Examinations Council',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: 'Standalone insurance — no sub-entities. WAEC covers all staff directly.',
    isActive: true,
  },
  {
    code: 'ACTIVA',
    name: 'Activa Insurance',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: 'Insurance company with ~22 employer sub-entities (Africell, BRAC, UBA, etc).',
    isActive: true,
  },
  {
    code: 'STACO',
    name: 'STACO Insurance',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: 'SICPA/SL insurance with ~12 sub-entity variants.',
    isActive: true,
  },
  {
    code: 'RCB',
    name: 'Rokel Commercial Bank',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: 'Standalone — bank employee medical coverage.',
    isActive: true,
  },
];

// ─── SUB-ENTITIES ───
// Normalized to canonical codes (deduped from ~95 AIC, ~85 RHIP variants)
const subEntitiesByProgram = {
  AIC: [
    { code: 'AE', name: 'AE (Action for Empowerment)' },
    { code: 'AFRICELL', name: 'Africell SL' },
    { code: 'AIRTEL', name: 'Airtel SL' },
    { code: 'BBC', name: 'BBC Media Action' },
    { code: 'CDH', name: 'CDH (Community Development Hub)' },
    { code: 'CHAI', name: 'Clinton Health Access Initiative' },
    { code: 'CHILD-FUND', name: 'ChildFund Sierra Leone' },
    { code: 'CWW', name: 'CWW (Community Water & WASH)' },
    { code: 'CRS', name: 'Catholic Relief Services' },
    { code: 'DALOG', name: 'DA Log (Danish Aid Logistics)' },
    { code: 'DHL', name: 'DHL Sierra Leone' },
    { code: 'EHEALTH', name: 'eHealth Africa' },
    { code: 'FRC', name: 'FRC (Family Relief Commission)' },
    { code: 'GIZ', name: 'GIZ (Deutsche Gesellschaft für Internationale Zusammenarbeit)' },
    { code: 'GOAL', name: 'GOAL Sierra Leone' },
    { code: 'HOPE-INT', name: 'Hope International' },
    { code: 'IASL', name: 'IASL (International Aid Services of Liberia)' },
    { code: 'IBM', name: 'IBM Sierra Leone' },
    { code: 'IFRC', name: 'International Federation of Red Cross' },
    { code: 'IGF', name: 'IGF (Initiative for Global Growth)' },
    { code: 'JHPREGO', name: 'Jhpiego' },
    { code: 'JOZI-POWER', name: 'Jozi Power' },
    { code: 'LFSL', name: 'Life for Salone' },
    { code: 'MSSL', name: 'MSSL (Medical Services & Supplies Ltd)' },
    { code: 'MUNIFA', name: 'MUNIFA' },
    { code: 'NRA', name: 'National Revenue Authority' },
    { code: 'NSST', name: 'NSST' },
    { code: 'ORANGE', name: 'Orange Sierra Leone' },
    { code: 'OSIWA', name: 'Open Society Initiative for West Africa' },
    { code: 'PC', name: 'Peace Corps' },
    { code: 'PEACE-CROPS', name: 'Peace Crops' },
    { code: 'PI', name: 'PI (Population International)' },
    { code: 'PIH', name: 'Partners In Health' },
    { code: 'PLAN', name: 'Plan International' },
    { code: 'SCB', name: 'Sierra Leone Commercial Bank' },
    { code: 'SSSL', name: 'SSSL (Sierra Leone Social Security)' },
    { code: 'STAFF', name: 'AIC Staff' },
    { code: 'TLF', name: 'TLF (The Learning Foundation)' },
    { code: 'TLS', name: 'TLS (Transparency International SL)' },
    { code: 'UTB', name: 'United Trust Bank' },
    { code: 'WAT-AID', name: 'WaterAid' },
    { code: 'WHI', name: 'WHI (World Hope International)' },
    { code: 'WVSL', name: 'World Vision Sierra Leone' },
  ].filter((v, i, a) => a.findIndex(x => x.code === v.code) === i), // dedupe

  RHIP: [
    { code: 'AAH', name: 'AAH (Action Against Hunger)' },
    { code: 'ABT', name: 'ABT Associates' },
    { code: 'AFRICELL', name: 'Africell SL' },
    { code: 'APEX-BANK', name: 'Apex Bank' },
    { code: 'BBA', name: 'BBA (Bolloré Blue Africa)' },
    { code: 'BBC', name: 'BBC Media Action' },
    { code: 'CWW', name: 'CWW (Community Water & WASH)' },
    { code: 'DIG', name: 'DIG (Development Initiatives Group)' },
    { code: 'DKT', name: 'DKT International' },
    { code: 'EASY-SOLAR', name: 'Easy Solar' },
    { code: 'ES', name: 'ES (Energy Services)' },
    { code: 'FG', name: 'FG (Family Guidance)' },
    { code: 'FGOLD', name: 'FGOLD (Family Guidance Organisation)' },
    { code: 'GAS', name: 'Gas' },
    { code: 'GIZ', name: 'GIZ' },
    { code: 'HI', name: 'HI (Humanity & Inclusion)' },
    { code: 'ICAP', name: 'ICAP at Columbia University' },
    { code: 'IE', name: 'IE (International Education)' },
    { code: 'IRC', name: 'IRC (International Rescue Committee)' },
    { code: 'JPO', name: 'JPO (Junior Professional Officers)' },
    { code: 'JOZI-POWER', name: 'Jozi Power' },
    { code: 'KSLP', name: 'KSLP (Koret SL Partnership)' },
    { code: 'MANTRAC', name: 'Mantrac Sierra Leone' },
    { code: 'MAYFAIR', name: 'Mayfair Trading' },
    { code: 'MML', name: 'MML (Mining & Minerals Ltd)' },
    { code: 'NDI', name: 'NDI (National Democratic Institute)' },
    { code: 'RAINBOW', name: 'Rainbow Initiative' },
    { code: 'RI', name: 'RI (Relief International)' },
    { code: 'SCSL', name: 'Sierra Leone Commercial Bank' },
    { code: 'SCI', name: 'Save the Children International' },
    { code: 'SB', name: 'SB (Standard Bank)' },
    { code: 'SKYE-BANK', name: 'Skye Bank' },
    { code: 'SL-MINING', name: 'SL Mining' },
    { code: 'SLBC', name: 'Sierra Leone Broadcasting Corporation' },
    { code: 'SOLTHIS', name: 'Solthis (Solidarité Thérapeutique et Santé)' },
    { code: 'SUNKING', name: 'SunKing' },
  ],

  ACTIVA: [
    { code: 'AFRICELL', name: 'Africell SL' },
    { code: 'BRAC', name: 'BRAC Sierra Leone' },
    { code: 'CWW', name: 'CWW (Community Water & WASH)' },
    { code: 'KINGHO', name: 'Kingho Mining' },
    { code: 'KRC', name: 'KRC (Koidu Resource Centre)' },
    { code: 'OVP', name: 'OVP (One Village Partner)' },
    { code: 'PI', name: 'PI (Population International)' },
    { code: 'RSL', name: 'RSL (Rio Tinto SL)' },
    { code: 'SCB', name: 'Sierra Leone Commercial Bank' },
    { code: 'UBA', name: 'United Bank for Africa' },
  ],

  STACO: [
    { code: 'CRFG', name: 'CRFG (Central Railway Floreine Group)' },
    { code: 'CRSG', name: 'CRSG' },
    { code: 'S-ENERGY', name: 'S-Energy' },
    { code: 'SICPA', name: 'SICPA/SL' },
    { code: 'TMM', name: 'TMM' },
    { code: 'UBA', name: 'United Bank for Africa' },
    { code: 'UTB', name: 'United Trust Bank' },
  ],
};

// WAEC and RCB are standalone — no sub-entities

async function seed() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  
  try {
    await client.connect();
    const db = client.db('carefaamemr');
    
    const programsCol = db.collection('insurance-programs');
    const subsCol = db.collection('insurance-sub-entities');
    
    // Check existing
    const existingPrograms = await programsCol.find({}).toArray();
    console.log(`Found ${existingPrograms.length} existing programs`);
    
    // ─── UPSERT PROGRAMS ───
    const programIds = {};
    for (const prog of programs) {
      const existing = await programsCol.findOne({ code: prog.code });
      if (existing) {
        programIds[prog.code] = existing._id;
        console.log(`  Program "${prog.code}" already exists (${existing._id})`);
      } else {
        const result = await programsCol.insertOne({ ...prog, createdAt: new Date(), updatedAt: new Date() });
        programIds[prog.code] = result.insertedId;
        console.log(`  Created program "${prog.code}" (${result.insertedId})`);
      }
    }
    
    // ─── UPSERT SUB-ENTITIES ───
    let createdSubs = 0;
    let skippedSubs = 0;
    
    for (const [progCode, subs] of Object.entries(subEntitiesByProgram)) {
      const programId = programIds[progCode];
      if (!programId) {
        console.log(`  Skipping subs for "${progCode}" — program not found`);
        continue;
      }
      
      for (const sub of subs) {
        const existing = await subsCol.findOne({ programId, code: sub.code });
        if (existing) {
          skippedSubs++;
        } else {
          await subsCol.insertOne({
            programId,
            code: sub.code,
            name: sub.name,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          createdSubs++;
        }
      }
    }
    
    console.log(`\nSub-entities: ${createdSubs} created, ${skippedSubs} already existed`);
    
    // ─── SUMMARY ───
    const totalPrograms = await programsCol.countDocuments({});
    const totalSubs = await subsCol.countDocuments({});
    console.log(`\nTotal in DB: ${totalPrograms} programs, ${totalSubs} sub-entities`);
    
    // List all programs with sub-entity counts
    console.log('\n── Programs with sub-entity counts ──');
    for (const prog of programs) {
      const subCount = await subsCol.countDocuments({ programId: programIds[prog.code] });
      console.log(`  ${prog.code} (${prog.name}): ${subCount} sub-entities`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

seed();
