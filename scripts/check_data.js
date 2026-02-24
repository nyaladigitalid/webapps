const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const rootEnv = path.join(__dirname, '..', '.env');
dotenv.config({ path: rootEnv });

async function main() {
  let connection;
  try {
    let config = {
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT || 3306
    };

    if (process.env.MYSQL_URL) {
      try {
        const u = new URL(process.env.MYSQL_URL);
        config = {
          host: u.hostname || 'localhost',
          port: Number(u.port || 3306),
          user: decodeURIComponent(u.username || ''),
          password: decodeURIComponent(u.password || ''),
          database: (u.pathname || '').replace(/^\//, '') || undefined,
        };
      } catch (e) {
        console.error('Error parsing MYSQL_URL:', e);
      }
    }

    console.log('Connecting to database...');
    connection = await mysql.createConnection(config);

    console.log('Fetching orders...');
    const [rows] = await connection.execute(`
      SELECT o.id, c.name, o.created_at, o.notes, p.total 
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      LEFT JOIN payments p ON p.order_id = o.id
    `);
    
    console.table(rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (connection) await connection.end();
  }
}

main();
