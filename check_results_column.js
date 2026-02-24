
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkColumns() {
    try {
        const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyaladigitaldb'
    });

        const [columns] = await connection.query("SHOW COLUMNS FROM campaigns LIKE 'result_type'");
        console.log('Columns found:', columns);
        await connection.end();
    } catch (e) {
        console.error(e);
    }
}

checkColumns();
