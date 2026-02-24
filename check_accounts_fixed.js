const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const { URL } = require('url');

dotenv.config({ path: path.join(__dirname, '.env') });

function parseMysqlEnv() {
  const url = process.env.MYSQL_URL;
  if (url) {
    try {
      const u = new URL(url);
      return {
        host: u.hostname || 'localhost',
        port: Number(u.port || 3306),
        user: decodeURIComponent(u.username || ''),
        password: decodeURIComponent(u.password || ''),
        database: (u.pathname || '').replace(/^\//, '') || undefined,
      };
    } catch (e) { console.error(e); }
  }
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  };
}

async function run() {
  try {
    const config = parseMysqlEnv();
    const conn = await mysql.createConnection(config);
    
    const [rows] = await conn.query('SELECT * FROM ad_accounts');
    console.log('Ad Accounts:', JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();