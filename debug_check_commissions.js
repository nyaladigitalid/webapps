
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        
        console.log('--- Order Assignments ---');
        const [rows] = await connection.query('SELECT * FROM order_assignments LIMIT 5');
        console.table(rows);
        
        if (rows.length > 0) {
            console.log('Updating commission amounts for testing...');
            await connection.query('UPDATE order_assignments SET commission_amount = 50000 WHERE id = 1');
            await connection.query('UPDATE order_assignments SET commission_amount = 75000 WHERE id = 2');
            console.log('Updated rows 1 and 2.');
        } else {
            console.log('No rows to update.');
        }

        connection.end();
    } catch (e) {
        console.error(e);
    }
}

run();
