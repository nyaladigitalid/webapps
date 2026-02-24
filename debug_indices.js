const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Checking indices on commission_rules table...');
    
    const [indices] = await connection.query(`SHOW INDEX FROM commission_rules`);
    console.log('Indices found:', indices.length);
    indices.forEach(idx => {
        console.log(`- ${idx.Key_name}: ${idx.Column_name} (Unique: ${idx.Non_unique === 0})`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
  }
}

run();