
require('dotenv').config();
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const path = require('path');

// Excel Date to JS Date
function excelDateToJSDate(serial) {
    if (!serial || isNaN(serial)) return null;
    const utc_days  = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;                                        
    const date_info = new Date(utc_value * 1000);
    return date_info;
}

async function debugSkipped() {
    console.log('Debugging skipped rows...');
    
    const filePath = path.join(__dirname, '../data', 'DataKlien.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
     console.log(`Total rows in Excel: ${data.length}`);

     let skippedCount = 0;
    let sampleSkipped = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) {
            skippedCount++;
            continue;
        }

        let isShifted = false;
        if (row[2] && String(row[2]).startsWith('ORD-')) {
            // Normal
        } else if (row[1] && String(row[1]).startsWith('ORD-')) {
            // Shifted
        } else {
            skippedCount++;
            if (sampleSkipped.length < 5) {
                sampleSkipped.push({ index: i, row: row });
            }
        }
    }

    console.log(`Total Skipped Rows: ${skippedCount}`);
    console.log('Sample Skipped Rows:', JSON.stringify(sampleSkipped, null, 2));
}

debugSkipped();
