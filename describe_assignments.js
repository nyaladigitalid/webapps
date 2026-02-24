
const mysql = require('mysql2/promise');

async function describe() {
    const pool = mysql.createPool({
        host: '127.0.0.1',
        user: 'nyaladigitaldb',
        password: 'passwordku',
        database: 'nyaladigitaldb',
        waitForConnections: true
    });

    try {
        const [rows] = await pool.query('DESCRIBE order_assignments');
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

describe();
