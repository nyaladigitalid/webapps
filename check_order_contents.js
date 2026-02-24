
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        const [rows] = await connection.query('DESCRIBE order_contents');
        console.table(rows);
        connection.end();
    } catch (e) {
        console.error(e);
    }
}
run();
