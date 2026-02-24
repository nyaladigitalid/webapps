
require('dotenv').config();
const mysql = require('mysql2/promise');
const path = require('path');

// Try to load .env from src/db if not found in root
if (!process.env.MYSQL_URL && !process.env.MYSQL_HOST) {
    require('dotenv').config({ path: path.join(__dirname, 'src', 'db', '.env') });
}

async function resetData() {
    console.log('Starting database cleanup...');
    
    const config = {
        host: process.env.MYSQL_HOST || 'localhost',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyala_ads'
    };

    if (process.env.MYSQL_URL) {
        const u = new URL(process.env.MYSQL_URL);
        config.host = u.hostname;
        config.port = Number(u.port);
        config.user = decodeURIComponent(u.username);
        config.password = decodeURIComponent(u.password);
        config.database = u.pathname.replace(/^\//, '');
    }

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('Connected to database.');

        // Disable foreign key checks to allow truncation/deletion in any order (though we try to be ordered)
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        const tables = [
            'campaign_improvements',
            'campaigns',
            'order_content_links',
            'order_contents',
            'order_assignments',
            'order_details',
            'order_targets',
            'payments',
            'orders',
            'clients'
        ];

        for (const table of tables) {
            try {
                // Check if table exists first
                const [rows] = await connection.query(`SHOW TABLES LIKE '${table}'`);
                if (rows.length > 0) {
                    await connection.query(`TRUNCATE TABLE ${table}`);
                    console.log(`Cleared table: ${table}`);
                } else {
                    console.log(`Table not found (skipping): ${table}`);
                }
            } catch (err) {
                // If TRUNCATE fails (e.g. due to FK even with checks off sometimes on specific engines), try DELETE
                console.log(`TRUNCATE failed for ${table}, trying DELETE...`);
                await connection.query(`DELETE FROM ${table}`);
                // Reset auto increment
                await connection.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
                console.log(`Cleared table (DELETE): ${table}`);
            }
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('Database cleanup completed successfully.');

    } catch (err) {
        console.error('Error cleaning database:', err);
    } finally {
        if (connection) await connection.end();
    }
}

resetData();
