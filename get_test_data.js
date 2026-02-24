
const mysql = require('mysql2/promise');

async function getData() {
    const pool = mysql.createPool({
        host: '127.0.0.1',
        user: 'nyaladigitaldb',
        password: 'passwordku',
        database: 'nyaladigitaldb',
        waitForConnections: true
    });

    try {
        const [users] = await pool.query('SELECT id, role, name FROM users WHERE role LIKE "%admin%"');
        console.log("Super Admins:", users);

        const [clients] = await pool.query('SELECT id, name FROM clients LIMIT 1');
        console.log("Client:", clients);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

getData();
