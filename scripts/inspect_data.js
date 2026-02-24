const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspect() {
    try {
        let config = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: 'nyaladigitaldb'
        };

        if (process.env.MYSQL_URL) {
            try {
                const u = new URL(process.env.MYSQL_URL);
                config.host = u.hostname;
                config.port = Number(u.port);
                config.user = decodeURIComponent(u.username);
                config.password = decodeURIComponent(u.password);
                config.database = u.pathname.replace(/^\//, '');
            } catch (e) {
                console.error('Invalid MYSQL_URL:', e);
            }
        }
        
        const connection = await mysql.createConnection(config);
        
        console.log('--- Campaigns Sample ---');
        const [camp] = await connection.query('SELECT ad_account_id FROM campaigns LIMIT 5');
        console.table(camp);

        console.log('--- Ad Accounts Sample ---');
        const [acc] = await connection.query('SELECT account_id, name FROM ad_accounts LIMIT 5');
        console.table(acc);
        
        await connection.end();
    } catch (e) {
        console.error(e);
    }
}

inspect();
