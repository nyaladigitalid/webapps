const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });
    
    const [rows] = await conn.query('SELECT * FROM ad_accounts');
    console.log('Ad Accounts:', JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();