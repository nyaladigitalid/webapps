
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

function ensureEnv() {
  const rootEnv = path.join(__dirname, '..', '.env');
  dotenv.config({ path: rootEnv });
}

ensureEnv();

async function main() {
  const config = {
      uri: process.env.DATABASE_URL || process.env.MYSQL_URL
  };
  
  if (!config.uri) {
      console.error("DATABASE_URL/MYSQL_URL not found in env");
      process.exit(1);
  }

  const connection = await mysql.createConnection(config.uri);

  console.log("Connected.");

  const [orders] = await connection.execute('SELECT id, duration_months, package_id FROM orders LIMIT 10');
  console.log('Orders Sample (After Update):', orders);
  
  await connection.end();
}

main().catch(console.error);
