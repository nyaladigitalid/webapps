const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../data/DataKlien.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const idx = {
    KampanyeId: 27
};

let campaignCount = 0;
// Start from row 1
for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Check shift logic briefly or just search the row for something looking like a campaign ID?
    // Let's use the robust logic from fix_migration.js to be accurate about column position
    
    // Quick heuristic from fix_migration.js:
    let currentIdx = { ...idx };
    
    // Check shift
    if (row[1] && (String(row[1]).startsWith('ORD-') || String(row[1]).startsWith('ID-'))) {
        currentIdx.KampanyeId = idx.KampanyeId - 1;
    } else if (row[2] && (String(row[2]).startsWith('ORD-') || String(row[2]).startsWith('ID-'))) {
        // Check partial shift
        const isWA = (val) => val && String(val).replace(/[^0-9]/g, '').startsWith('62');
        const waAt7 = isWA(row[7]);
        const waAt8 = isWA(row[8]);
        if (waAt7 && !waAt8) {
            if (idx.KampanyeId > 3) currentIdx.KampanyeId = idx.KampanyeId - 1;
        }
    } else {
        // No ID but maybe valid?
        const isWA = (val) => val && String(val).replace(/[^0-9]/g, '').startsWith('62');
        const waIndex = row.findIndex(c => isWA(c));
        if (waIndex > -1) {
             const shift = waIndex - 8;
             currentIdx.KampanyeId = idx.KampanyeId + shift;
        }
    }

    const campaignId = row[currentIdx.KampanyeId];
    if (campaignId && campaignId !== '#REF!' && String(campaignId).trim() !== '') {
        campaignCount++;
    }
}

console.log(`Total rows with Campaign ID in Excel: ${campaignCount}`);
