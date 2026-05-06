const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Running migration: create commission_rules table...');

    try {
      let dbName = 'nyaladigitaldb';
      try {
        const u = new URL(process.env.MYSQL_URL || '');
        dbName = (u.pathname || '').replace(/^\//, '') || dbName;
      } catch (_) {}

      await connection.query("CREATE USER IF NOT EXISTS 'nyaladigitaldb'@'localhost' IDENTIFIED BY 'passwordku'");
      await connection.query("CREATE USER IF NOT EXISTS 'nyaladigitaldb'@'127.0.0.1' IDENTIFIED BY 'passwordku'");
      await connection.query("ALTER USER 'nyaladigitaldb'@'localhost' IDENTIFIED BY 'passwordku'");
      await connection.query("ALTER USER 'nyaladigitaldb'@'127.0.0.1' IDENTIFIED BY 'passwordku'");
      await connection.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO 'nyaladigitaldb'@'localhost'`);
      await connection.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO 'nyaladigitaldb'@'127.0.0.1'`);
    } catch (e) {
      console.log('Skip creating DB user:', e.message);
    }
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        package_id INT NOT NULL,
        role VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_pkg_role (package_id, role)
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
