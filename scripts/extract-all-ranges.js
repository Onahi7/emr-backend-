// Extracting exact ranges from the images
const rangesFromImages = {
  FSH: {
    unit: 'mIU/mL',
    ranges: {
      'Female Follicular': '2.9-12.5',
      'Female Ovulation': '5.6-21.5',
      'Female Luteal': '1.5-7.7',
      'Female Postmenopausal': '23.0-134.8',
      'Male': '1.9-18.3'
    }
  },
  LH: {
    unit: 'mIU/mL',
    ranges: {
      'Female Follicular': '2.4-12.6',
      'Female Ovulation': '14.0-95.6',
      'Female Luteal': '1.0-11.4',
      'Female Postmenopausal': '7.7-58.5',
      'Male': '1.5-9.3'
    }
  },
  AMH: {
    unit: 'ng/mL',
    ranges: {
      '18-25 years': '0.9-7.5',
      '26-30 years': '0.5-6.8',
      '31-35 years': '0.2-5.5',
      '36-40 years': '0.1-3.5',
      '41-45 years': '0.03-2.5',
      '46-50 years': '0.01-1.5'
    }
  },
  ESTRADIOL: {
    unit: 'pg/mL',
    ranges: {
      'Male': '10-40',
      'Female Follicular': '12-166',
      'Female Ovulation': '85-498',
      'Female Luteal': '43-211',
      'Female Postmenopausal': '<10-28'
    }
  },
  PROG: {
    unit: 'ng/mL',
    ranges: {
      'Female Follicular': '<0.5',
      'Female Ovulation': '<0.5',
      'Female Luteal': '3-25',
      'Female Postmenopausal': '<0.4'
    }
  },
  PROLACTIN: {
    unit: 'ng/mL',
    ranges: {
      'Male': '3-13',
      'Female Non-pregnant': '3-27',
      'Female Pregnant': '10-209'
    }
  }
};

console.log('=== EXACT RANGES FROM IMAGES ===\n');
Object.entries(rangesFromImages).forEach(([code, data]) => {
  console.log(`${code} (${data.unit}):`);
  Object.entries(data.ranges).forEach(([phase, range]) => {
    console.log(`  ${phase}: ${range}`);
  });
  console.log('');
});

// Now let's compare with what's in the database
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  });
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function checkAndFix() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const catalog = db.collection('test_catalog');
  
  console.log('=== COMPARING WITH DATABASE ===\n');
  
  const codes = ['FSH', 'LH', 'AMH', 'ESTRADIOL', 'PROG', 'PROLACTIN'];
  const tests = await catalog.find({ code: { $in: codes } }).toArray();
  
  tests.forEach(test => {
    const correctRanges = rangesFromImages[test.code];
    if (!correctRanges) return;
    
    console.log(`\n${test.code}:`);
    console.log('  Current in DB:');
    if (test.referenceRanges && test.referenceRanges.length > 0) {
      test.referenceRanges.forEach(r => {
        console.log(`    ${r.ageGroup || r.gender}: ${r.range} ${r.unit || ''}`);
      });
    }
    console.log('  Should be (from images):');
    Object.entries(correctRanges.ranges).forEach(([phase, range]) => {
      console.log(`    ${phase}: ${range}`);
    });
  });
  
  await mongoose.disconnect();
}

checkAndFix().catch(e => console.error(e.message));
