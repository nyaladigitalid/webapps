
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkUsers() {
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
        const [rows] = await connection.query('SELECT id, name, role FROM users');
        console.log('Existing Users:', JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

checkUsers();
