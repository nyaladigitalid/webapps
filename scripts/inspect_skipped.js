const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../data/DataKlien.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Exactly as in fix_migration.js
const isWA = (val) => val && String(val).replace(/[^0-9]/g, '').startsWith('62');

console.log(`Total rows (including header): ${data.length}`);

let countID = 0;
let countWA = 0;
let countSkipped = 0;
const skippedRows = [];

// Start from row 1 (skip header)
for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    let hasId = false;
    
    // Check ID in Col 1
    if (row[1] && (String(row[1]).startsWith('ORD-') || String(row[1]).startsWith('ID-'))) {
        hasId = true;
    } 
    // Check ID in Col 2
    else if (row[2] && (String(row[2]).startsWith('ORD-') || String(row[2]).startsWith('ID-'))) {
        hasId = true;
    }
    
    if (hasId) {
        countID++;
    } else {
        // Try to find WA number
        const waIndex = row.findIndex(c => isWA(c));
        if (waIndex > -1) {
            countWA++;
        } else {
            countSkipped++;
            skippedRows.push({
                rowNum: i + 1,
                content: row
            });
        }
    }
}

console.log(`Rows with ID: ${countID}`);
console.log(`Rows recovered via WA: ${countWA}`);
console.log(`Rows Skipped (No ID, No WA): ${countSkipped}`);

if (countSkipped > 0) {
    console.log('Sample of skipped rows (first 5):');
    console.log(JSON.stringify(skippedRows.slice(0, 5), null, 2));
}
