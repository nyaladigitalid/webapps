const mysql = require('mysql2/promise');
require('dotenv').config();

async function testJoin() {
    try {
        let config = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: 'nyaladigitaldb'
        };
        
        const connection = await mysql.createConnection(config);
        
        console.log('--- Testing Join Logic ---');
        // Try to join campaigns and ad_accounts using SUBSTRING_INDEX
        const query = `
            SELECT c.id, c.campaign_name, c.ad_account_id, a.account_id, a.name as ad_account_name
            FROM campaigns c
            LEFT JOIN ad_accounts a ON a.account_id = SUBSTRING_INDEX(c.ad_account_id, '-', -1)
            LIMIT 5
        `;
        
        const [rows] = await connection.query(query);
        console.table(rows);
        
        await connection.end();
    } catch (e) {
        console.error(e);
    }
}

testJoin();
