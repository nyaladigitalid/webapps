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
        rate_value DECIMAL(8,4) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        status ENUM('accrued','approved','paid','reversed') NOT NULL DEFAULT 'accrued',
        source_event VARCHAR(50),
        ref_txn_id INT,
        rule_id INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        posted_at DATETIME,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ledger_order (order_id),
        INDEX idx_ledger_user (user_id),
        INDEX idx_ledger_status (status)
      )
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payout_batch (
        id INT AUTO_INCREMENT PRIMARY KEY,
        period_start DATE,
        period_end DATE,
        created_by INT,
        status ENUM('draft','posted') NOT NULL DEFAULT 'draft',
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        posted_at DATETIME,
        INDEX idx_batch_status (status)
      )
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payout_batch_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id INT NOT NULL,
        ledger_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_batch_ledger (batch_id, ledger_id),
        INDEX idx_items_batch (batch_id),
        INDEX idx_items_ledger (ledger_id)
      )
    `);
    console.log('Migration completed: commission_ledger, payout_batch, payout_batch_items');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    await connection.end();
  }
}

run();
