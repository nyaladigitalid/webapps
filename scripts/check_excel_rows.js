const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../data', 'DataKlien.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('Total rows:', data.length);
console.log('Headers:', data[0]);
console.log('Row 101 (index 101):', data[101]);