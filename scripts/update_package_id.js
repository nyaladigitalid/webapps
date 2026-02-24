
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

  try {
    const [result] = await connection.execute(`
      UPDATE orders o
      JOIN packages p ON o.duration_months = p.duration
      SET o.package_id = p.id
    `);
    
    console.log('Update Result:', result);
    console.log(`Updated ${result.affectedRows} rows.`);
  } catch (error) {
    console.error('Update failed:', error);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
