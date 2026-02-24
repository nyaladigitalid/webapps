const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Fixing indices on commission_rules table...');
    
    // Check if unique_pkg_role exists
    try {
        await connection.query(`ALTER TABLE commission_rules DROP INDEX unique_pkg_role`);
        console.log('Successfully dropped old index: unique_pkg_role');
    } catch (e) {
        console.log('Error dropping unique_pkg_role (might not exist):', e.message);
    }

    console.log('Migration completed.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

run();