const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        
        console.log('--- Checking current schema ---');
        const [rows] = await connection.query('DESCRIBE order_assignments');
        const hasAmount = rows.some(r => r.Field === 'commission_amount');
        
        if (!hasAmount) {
            console.log('--- Adding commission_amount column ---');
            await connection.query('ALTER TABLE order_assignments ADD COLUMN commission_amount DECIMAL(10,2) DEFAULT NULL AFTER content_type');
            console.log('--- Column added successfully ---');
        } else {
            console.log('--- Column already exists ---');
        }
        
        console.log('--- Current Schema ---');
        const [rowsNew] = await connection.query('DESCRIBE order_assignments');
        console.table(rowsNew);

        connection.end();
    } catch (e) {
        console.error(e);
    }
}

run();