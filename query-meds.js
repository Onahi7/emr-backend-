const { MongoClient } = require('mongodb');

async function run() {
  // Try multiple connection approaches
  const uris = [
    'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamemr?retryWrites=true&w=majority&appName=Cluster0',
    'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamemr?retryWrites=true&w=majority',
  ];
  
  for (const uri of uris) {
    const client = new MongoClient(uri, { 
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 20000,
    });
    try {
      await client.connect();
      const db = client.db('carefaamemr');

      console.log('=== ALL MEDICATIONS ===');
      const meds = await db.collection('medications').find({}).sort({ name: 1 }).toArray();
      console.log(`Total: ${meds.length}\n`);

      console.log('--- By Current Category ---');
      const byCategory = {};
      for (const m of meds) {
        const cat = m.category || 'uncategorized';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(m);
      }
      for (const [cat, items] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
        console.log(`\n  ${cat} (${items.length}):`);
        items.forEach(m => {
          const controlled = m.isControlled ? ' [CONTROLLED]' : '';
          const caf = m.isCafSourced ? ' [CAF]' : '';
          console.log(`    ${m.name}${controlled}${caf} | Stock: ${m.stockQuantity || 0} | Price: Le ${(m.unitPrice || 0).toLocaleString()} | Code: ${m.medicationCode || 'N/A'} | Form: ${m.dosageForm || 'N/A'}`);
        });
      }

      // Route analysis
      console.log('\n\n--- By Dosage Form ---');
      const byForm = {};
      for (const m of meds) {
        const form = (m.dosageForm || 'unknown').toLowerCase();
        if (!byForm[form]) byForm[form] = [];
        byForm[form].push(m.name);
      }
      for (const [form, names] of Object.entries(byForm).sort((a, b) => b[1].length - a[1].length)) {
        console.log(`  ${form}: ${names.join(', ')}`);
      }

      // Controlled substances
      console.log('\n--- Controlled Substances ---');
      const controlled = meds.filter(m => m.isControlled);
      if (controlled.length === 0) console.log('  None');
      controlled.forEach(m => console.log(`  ${m.name}`));

      // CAF vs Local
      console.log('\n--- CAF vs Local ---');
      const caf = meds.filter(m => m.isCafSourced);
      const local = meds.filter(m => !m.isCafSourced);
      console.log(`  CAF: ${caf.length}`);
      console.log(`  Local: ${local.length}`);

      // Sample full doc
      console.log('\n--- Sample Medication Doc ---');
      if (meds[0]) console.log(JSON.stringify(meds[0], null, 2));

      await client.close();
      return;
    } catch (err) {
      console.error('Connection failed:', err.message);
      await client.close();
    }
  }
}
run();
