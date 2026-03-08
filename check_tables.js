require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTables() {
    const pool = mysql.createPool(process.env.MYSQL_URL);
    try {
        const [tables] = await pool.query('SHOW TABLES');
        console.log('Tables:', tables.map(t => Object.values(t)[0]));

        const [commissions] = await pool.query('DESCRIBE commissions').catch(() => [[]]);
        console.log('Commissions:', commissions);

        const [assignments] = await pool.query('DESCRIBE order_assignments').catch(() => [[]]);
        console.log('Assignments:', assignments);

        const [contents] = await pool.query('DESCRIBE order_contents').catch(() => [[]]);
        console.log('Contents:', contents);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkTables();
