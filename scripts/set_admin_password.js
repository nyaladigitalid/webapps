require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const url = process.env.MYSQL_URL;
  if (!url) {
    console.error('MYSQL_URL not set in .env');
    process.exit(1);
  }
  const conn = await mysql.createConnection(url);
  try {
    const [res] = await conn.execute(
      'UPDATE users SET password_hash = ? WHERE email = ?',
      ['Nyala123', 'admin@nyala.local']
    );
    console.log('Rows affected:', res.affectedRows);
  } catch (e) {
    console.error('Error updating password:', e.message || e);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
