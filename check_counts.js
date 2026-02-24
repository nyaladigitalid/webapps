
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkCounts() {
    let config = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyala_ads'
    };

    if (process.env.MYSQL_URL) {
        const u = new URL(process.env.MYSQL_URL);
        config.host = u.hostname;
        config.port = Number(u.port);
        config.user = decodeURIComponent(u.username);
        config.password = decodeURIComponent(u.password);
        config.database = u.pathname.replace(/^\//, '');
    }

    let connection;
    try {
        connection = await mysql.createConnection(config);
        const [clients] = await connection.query('SELECT COUNT(*) as count FROM clients');
        const [orders] = await connection.query('SELECT COUNT(*) as count FROM orders');
        const [campaigns] = await connection.query('SELECT COUNT(*) as count FROM campaigns');
        const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
        
        console.log({
            clients: clients[0].count, 
            orders: orders[0].count, 
            campaigns: campaigns[0].count,
            users: users[0].count
        });

        const [sampleOrder] = await connection.query('SELECT * FROM orders LIMIT 1');
        console.log('Sample Order:', JSON.stringify(sampleOrder[0], null, 2));

        const [sampleClient] = await connection.query('SELECT * FROM clients LIMIT 1');
        console.log('Sample Client:', JSON.stringify(sampleClient[0], null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

checkCounts();
