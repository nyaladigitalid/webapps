const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const url = process.env.MYSQL_URL || 'mysql://root:@localhost:3306/nyala_ads';
        const conn = await mysql.createConnection(url);
        
        console.log('Testing total_spend subquery...');
        const [rows] = await conn.query(`
            SELECT o.id, 
                   (SELECT COALESCE(SUM(spend), 0) FROM campaigns WHERE order_id = o.id) as total_spend 
            FROM orders o 
            LIMIT 5
        `);
        console.log(rows);
        
        await conn.end();
    } catch (e) {
        console.error(e);
    }
}

run();