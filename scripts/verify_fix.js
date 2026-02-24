
require('dotenv').config();
const mysql = require('mysql2/promise');

async function verify() {
    let config = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyala_ads'
    };
    
    if (process.env.MYSQL_URL) {
        try {
            const u = new URL(process.env.MYSQL_URL);
            config.host = u.hostname;
            config.port = Number(u.port);
            config.user = decodeURIComponent(u.username);
            config.password = decodeURIComponent(u.password);
            config.database = u.pathname.replace(/^\//, '');
        } catch (e) { console.error(e); }
    }

    const connection = await mysql.createConnection(config);

    try {
        const [orders] = await connection.query('SELECT COUNT(*) as count FROM orders');
        const [campaigns] = await connection.query('SELECT COUNT(*) as count FROM campaigns');
        const [clients] = await connection.query('SELECT COUNT(*) as count FROM clients');

        console.log('Final Database Counts:');
        console.log(`- Clients: ${clients[0].count}`);
        console.log(`- Orders: ${orders[0].count}`);
        console.log(`- Campaigns: ${campaigns[0].count}`);
        
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

verify();
