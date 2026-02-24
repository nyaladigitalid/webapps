require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        console.log('Connected to database.');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS campaign_improvements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                campaign_id INT NOT NULL,
                user_id INT NOT NULL,
                details TEXT,
                improvement_date DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        console.log('Table campaign_improvements created or already exists.');
        
        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
}

migrate();