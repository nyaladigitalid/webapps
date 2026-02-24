const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        const [rows] = await connection.query("SHOW TABLES LIKE 'order_content_links'");
        console.log(rows.length > 0 ? 'TABLE_EXISTS' : 'TABLE_MISSING');
        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
})();
