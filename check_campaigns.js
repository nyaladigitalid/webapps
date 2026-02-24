const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const url = process.env.MYSQL_URL || 'mysql://root:@localhost:3306/nyala_ads';
        const conn = await mysql.createConnection(url);
        
        console.log('Checking campaigns table...');
        const [rows] = await conn.query('SELECT * FROM campaigns LIMIT 5');
        console.log('Campaigns:', rows);
        
        console.log('Checking orders table...');
        const [orders] = await conn.query('SELECT id, client_id, package_id, status FROM orders LIMIT 5');
        console.log('Orders:', orders);

        await conn.end();
    } catch (e) {
        console.error(e);
    }
}

run();