const mysql = require('mysql2/promise');

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      user: 'nyaladigitaldb',
      password: 'passwordku',
      database: 'nyaladigitaldb'
    });
    
    console.log('Connected to database.');

    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('Tables:', tableNames);
    
    try {
        const [cols] = await connection.query("SHOW COLUMNS FROM campaigns LIKE 'targeting'");
        console.log('Targeting col:', cols.length > 0 ? 'EXISTS' : 'MISSING');
    } catch (e) {
        console.log('Error checking targeting col:', e.message);
    }
    
    // Check if ad_accounts exists
    console.log('ad_accounts exists:', tableNames.includes('ad_accounts'));

    await connection.end();
  } catch (err) {
    console.error('Error:', err);
  }
})();