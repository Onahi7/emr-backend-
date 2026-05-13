// Based on the reference ranges shown in the images
const correctRanges = {
  FSH: {
    unit: 'mIU/mL',
    ranges: [
      { phase: 'Follicular', range: '3.5-12.5' },
      { phase: 'Ovulation', range: '4.7-21.5' },
      { phase: 'Luteal', range: '1.7-7.7' },
      { phase: 'Postmenopausal', range: '25.8-134.8' },
      { phase: 'Male', range: '1.9-18.3' },
    ]
  },
  LH: {
    unit: 'mIU/mL',
    ranges: [
      { phase: 'Follicular', range: '2.4-12.6' },
      { phase: 'Ovulation', range: '14.0-95.6' },
      { phase: 'Luteal', range: '1.0-11.4' },
      { phase: 'Postmenopausal', range: '7.7-58.5' },
      { phase: 'Male', range: '1.5-9.3' },
    ]
  },
  AMH: {
    unit: 'ng/mL',
    ranges: [
      { age: '18-25 years', range: '0.9-7.5' },
      { age: '26-30 years', range: '0.5-6.8' },
      { age: '31-35 years', range: '0.2-5.5' },
      { age: '36-40 years', range: '0.1-3.5' },
      { age: '41-45 years', range: '0.03-2.5' },
      { age: '46-50 years', range: '0.01-1.5' },
    ]
  },
  ESTRADIOL: {
    unit: 'pg/mL',
    ranges: [
      { phase: 'Male', range: '10-40' },
      { phase: 'Female Follicular', range: '12-166' },
      { phase: 'Female Ovulation', range: '85-498' },
      { phase: 'Female Luteal', range: '43-211' },
      { phase: 'Postmenopausal', range: '<10-28' },
    ]
  },
  PROG: {
    unit: 'ng/mL',
    ranges: [
      { phase: 'Female Follicular', range: '<0.5' },
      { phase: 'Female Ovulation', range: '<0.5' },
      { phase: 'Female Luteal', range: '3-25' },
      { phase: 'Female Postmenopausal', range: '<0.4' },
    ]
  },
  PROLACTIN: {
    unit: 'ng/mL',
    ranges: [
      { phase: 'Male', range: '3-13' },
      { phase: 'Female Non-pregnant', range: '3-27' },
      { phase: 'Female Pregnant', range: '10-209' },
    ]
  }
};

console.log('=== CORRECT REFERENCE RANGES FROM IMAGES ===\n');

Object.entries(correctRanges).forEach(([code, data]) => {
  console.log(`${code} (${data.unit}):`);
  data.ranges.forEach(r => {
    const label = r.phase || r.age || '';
    console.log(`  ${label}: ${r.range}`);
  });
  console.log('');
});

console.log('\n=== NOTES ===');
console.log('• FSH and LH use cycle phases for females (Follicular/Ovulation/Luteal)');
console.log('• AMH uses specific age brackets');
console.log('• ESTRADIOL has separate ranges for males and female cycle phases');
console.log('• PROG uses threshold values (<0.5) for follicular/ovulation phases');
console.log('• PROLACTIN has different ranges for males, non-pregnant females, and pregnant females');
