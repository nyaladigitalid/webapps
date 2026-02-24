const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspect() {
    try {
        let config = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: 'nyaladigitaldb' // Hardcoded for now based on .env
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
        
        console.log('--- Table: campaigns ---');
        const [rows] = await connection.query('DESCRIBE campaigns');
        console.table(rows);
        
        console.log('--- Checking for campaign_insights table ---');
        const [tables] = await connection.query("SHOW TABLES LIKE 'campaign_insights'");
        if (tables.length > 0) {
            console.log('Found campaign_insights table!');
            const [insightRows] = await connection.query('DESCRIBE campaign_insights');
            console.table(insightRows);
        } else {
            console.log('campaign_insights table NOT found.');
        }

        await connection.end();
    } catch (e) {
        console.error(e);
    }
}

inspect();
