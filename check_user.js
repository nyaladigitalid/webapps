const mysql = require('mysql2/promise');

async function check() {
    const c = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        database: 'nyaladigitaldb'
    });
    const [rows] = await c.execute('SELECT * FROM users WHERE id=1');
    console.log(rows);
    await c.end();
}
check();
