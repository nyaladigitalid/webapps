
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Running migration: create order_content_links table...');
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`order_content_links\` (
        \`id\` int AUTO_INCREMENT PRIMARY KEY,
        \`order_id\` int NOT NULL,
        \`url\` text NOT NULL,
        \`type\` varchar(50),
        \`description\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

run();
