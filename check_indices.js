const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

function ensureEnv() {
  const rootEnv = path.join(__dirname, '.env');
  const dbEnv = path.join(__dirname, 'src', 'db', '.env');
  dotenv.config({ path: rootEnv });
  dotenv.config({ path: dbEnv });
}
ensureEnv();

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
    } catch (_) {}
  }
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || undefined,
  };
}

(async () => {
  try {
    const config = parseMysqlEnv();
    const connection = await mysql.createConnection(config);
    const [rows] = await connection.query('SHOW INDEX FROM commission_rules');
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
  } catch (error) {
    console.error('Error:', error);
  }
})();
