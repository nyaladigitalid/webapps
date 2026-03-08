require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkMoreTables() {
    const pool = mysql.createPool(process.env.MYSQL_URL);
    try {
        const [rules] = await pool.query('DESCRIBE commission_rules').catch(() => [[]]);
        console.log('Rules:', rules);

        const [links] = await pool.query('DESCRIBE order_content_links').catch(() => [[]]);
        console.log('Links:', links);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkMoreTables();
