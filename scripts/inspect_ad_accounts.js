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
        
        console.log('--- Table: ad_accounts ---');
        const [rows] = await connection.query('DESCRIBE ad_accounts');
        console.table(rows);
        
        await connection.end();
    } catch (e) {
        console.error(e);
    }
}

inspect();
