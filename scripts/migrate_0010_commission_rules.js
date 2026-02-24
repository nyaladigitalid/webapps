const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Running migration: create commission_rules table...');
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        package_id INT NOT NULL,
        role VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_pkg_role (package_id, role),
        FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
      );
    `);
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

run();