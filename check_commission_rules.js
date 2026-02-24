const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkRules() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);

        const [rows] = await connection.query("SELECT * FROM commission_rules WHERE role = 'Editor'");
        console.log('Commission Rules for Editor:');
        console.table(rows);

        connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkRules();