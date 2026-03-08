require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTransactions() {
    const pool = mysql.createPool(process.env.MYSQL_URL);
    try {
        const [trans] = await pool.query('DESCRIBE transactions').catch(() => [[]]);
        console.log('Transactions:', trans);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkTransactions();
