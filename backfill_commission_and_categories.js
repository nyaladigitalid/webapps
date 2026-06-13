const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  try {
    const pool = mysql.createPool(process.env.MYSQL_URL);
    const conn = await pool.getConnection();

    // Backfill categories
    const [result] = await conn.query(
      'UPDATE transactions SET category = ? WHERE order_id IS NOT NULL AND type = ? AND category IS NULL',
      ['Pembayaran Order', 'income']
    );
    console.log('✓ Backfilled:', result.changedRows, 'transactions with category "Pembayaran Order"');

    // Approve commissions for demo
    const [approvalResult] = await conn.query(
      'UPDATE commission_ledger SET approval_status = ?, approved_at = NOW() WHERE approval_status = ? AND order_id IN (?, ?, ?)',
      ['approved', 'pending', 1785, 1786, 1787]
    );
    console.log('✓ Approved:', approvalResult.changedRows, 'commissions');

    // Show updated data
    const [txs] = await conn.query(
      'SELECT id, order_id, type, amount, category FROM transactions WHERE order_id IS NOT NULL ORDER BY created_at DESC LIMIT 3'
    );
    console.log('\n=== Updated Transactions ===');
    console.log(JSON.stringify(txs, null, 2));

    const [commissions] = await conn.query(
      'SELECT id, order_id, amount, status, approval_status FROM commission_ledger WHERE order_id IN (?, ?, ?) ORDER BY created_at DESC',
      [1785, 1786, 1787]
    );
    console.log('\n=== Updated Commissions ===');
    console.log(JSON.stringify(commissions, null, 2));

    conn.release();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
