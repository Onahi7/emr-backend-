const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const dir = 'C:\\Users\\NEWUSER\\Documents\\Robin cooker';

const searchTerms = ['aureol', 'aureole', 'aureal', 'aurel', 'aruol', 'arole'];

function walkDir(d) {
  let results = [];
  const list = fs.readdirSync(d);
  list.forEach(file => {
    const fp = path.join(d, file);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(fp));
    } else if (/\.(xlsx|xls|ods)$/i.test(file) && !file.startsWith('~$')) {
      results.push(fp);
    }
  });
  return results;
}

const files = walkDir(dir);
console.log(`Scanning ${files.length} Excel files...\n`);

for (const fp of files) {
  try {
    const wb = XLSX.readFile(fp, { type: 'buffer' });
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          const cell = String(data[r][c]).toLowerCase();
          for (const term of searchTerms) {
            if (cell.includes(term)) {
              const relPath = path.relative(dir, fp);
              console.log(`MATCH: "${data[r][c]}" in ${relPath} | Sheet: ${sheetName} | Row ${r+1}, Col ${c+1}`);
              // Print surrounding context
              const context = data[r].filter(x => x).join(' | ');
              console.log(`  Full row: ${context}`);
            }
          }
        }
      }
    }
  } catch (e) {
    // skip unreadable files
  }
}

console.log('\nDone.');
