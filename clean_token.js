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
    
    const [rows] = await conn.query('SELECT id, access_token FROM meta_ads_configs WHERE is_active = 1');
    
    for (const row of rows) {
      let token = row.access_token || '';
      // Clean up common copy-paste errors from JS/Code
      // Example: const ACCESS_TOKEN = '...';
      if (token.includes('const ACCESS_TOKEN')) {
        token = token.replace(/const\s+ACCESS_TOKEN\s*=\s*['"]/, '').replace(/['"];?\s*$/, '');
        console.log(`Cleaning token for ID ${row.id}: ${token.substring(0, 10)}...`);
        await conn.query('UPDATE meta_ads_configs SET access_token = ? WHERE id = ?', [token, row.id]);
      }
    }
    
    console.log('Token cleanup complete.');
    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();