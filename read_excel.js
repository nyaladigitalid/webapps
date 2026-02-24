
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'DataKlien.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length === 0) {
        console.log('File is empty');
        process.exit(0);
    }

    console.log('--- Headers ---');
    console.log(JSON.stringify(data[0], null, 2));

    console.log('\n--- First 3 Rows ---');
    data.slice(1, 4).forEach((row, index) => {
        console.log(`Row ${index + 1}:`, JSON.stringify(row, null, 2));
    });

} catch (err) {
    console.error('Error reading excel file:', err);
}
