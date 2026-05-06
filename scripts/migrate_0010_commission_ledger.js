const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS commission_ledger (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        user_id INT NOT NULL,
        role VARCHAR(50) NOT NULL,
        content_type VARCHAR(20),
        basis_amount DECIMAL(12,2),
        rate_type ENUM('flat','percent') NOT NULL,
        rate_value DECIMAL(12,4) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        status ENUM('accrued','approved','paid','reversed') NOT NULL DEFAULT 'accrued',
        source_event VARCHAR(50),
        ref_txn_id INT,
        rule_id INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        posted_at DATETIME,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ledger_event (order_id, user_id, role, source_event),
        INDEX idx_ledger_order (order_id),
        INDEX idx_ledger_user (user_id),
        INDEX idx_ledger_status (status)
      )
    `);
    console.log('Migration completed: commission_ledger');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    await connection.end();
  }
}

run();
