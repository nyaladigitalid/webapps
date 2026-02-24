const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function setupTable() {
    const config = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyaladigitaldb',
        port: Number(process.env.MYSQL_PORT) || 3306
    };

    console.log('Connecting to database...', config.host);
    
    try {
        const connection = await mysql.createConnection(config);
        
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS scalev_orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                scalev_order_id VARCHAR(50) NOT NULL,
                invoice_number VARCHAR(100),
                customer_name VARCHAR(191),
                customer_phone VARCHAR(50),
                customer_email VARCHAR(191),
                payment_method VARCHAR(50),
                payment_status VARCHAR(50),
                total_amount DECIMAL(15, 2),
                items TEXT,
                status VARCHAR(50),
                raw_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (scalev_order_id),
                INDEX (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await connection.query(createTableQuery);
        console.log('Table scalev_orders created or already exists.');
        
        await connection.end();
    } catch (error) {
        console.error('Error creating table:', error);
    }
}

setupTable();
