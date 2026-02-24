require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        console.log('Connected to database.');

        // Check if column exists
        const [columns] = await connection.query("SHOW COLUMNS FROM campaigns LIKE 'result_type'");
        
        if (columns.length === 0) {
            await connection.query("ALTER TABLE campaigns ADD COLUMN result_type VARCHAR(100) DEFAULT 'Results'");
            console.log('Column result_type added to campaigns table.');
        } else {
            console.log('Column result_type already exists.');
        }
        
        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
}

migrate();
