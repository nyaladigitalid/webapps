
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testQuery() {
    let config = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyala_ads'
    };

    if (process.env.MYSQL_URL) {
        try {
            const u = new URL(process.env.MYSQL_URL);
            config.host = u.hostname;
            config.port = Number(u.port);
            config.user = decodeURIComponent(u.username);
            config.password = decodeURIComponent(u.password);
            config.database = u.pathname.replace(/^\//, '');
        } catch (e) {
            console.error('Invalid MYSQL_URL:', e);
        }
    }

    const connection = await mysql.createConnection(config);

    try {
        let sql = `
          SELECT c.id, c.name, 
                 GROUP_CONCAT(DISTINCT u.name SEPARATOR ', ') as cs_names
          FROM clients c
          LEFT JOIN orders o ON c.id = o.client_id
          LEFT JOIN order_assignments oa ON o.id = oa.order_id AND oa.role = 'CS'
          LEFT JOIN users u ON oa.user_id = u.id
          GROUP BY c.id
          ORDER BY c.name ASC
          LIMIT 5
        `;
        
        console.log('Executing query...');
        const [rows] = await connection.query(sql);
        console.log('Query successful!');
        console.table(rows);

    } catch (err) {
        console.error('Query failed:', err);
    } finally {
        await connection.end();
    }
}

testQuery();
