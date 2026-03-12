const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  try {
    const [idx] = await connection.query(`SHOW INDEX FROM commission_ledger WHERE Key_name = 'uniq_ledger_event'`);
    if (idx.length === 0) {
      await connection.query(`
        ALTER TABLE commission_ledger
        ADD UNIQUE KEY uniq_ledger_event (order_id, user_id, role, source_event)
      `);
      console.log('Added unique index uniq_ledger_event on commission_ledger');
    } else {
      console.log('Index uniq_ledger_event already exists');
    }
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    await connection.end();
  }
}

run();
