const mysql = require('mysql2/promise');

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      user: 'nyaladigitaldb',
      password: 'passwordku',
      database: 'nyaladigitaldb'
    });
    
    const [rows] = await connection.query('SELECT * FROM __drizzle_migrations');
    console.log('Migrations:', rows);
    
    // Also drop targeting column here to prep for the fix
    try {
        await connection.query('ALTER TABLE campaigns DROP COLUMN targeting');
        console.log('Dropped targeting column.');
    } catch (e) {
        console.log('Targeting column not found or error:', e.message);
    }

    await connection.end();
  } catch (err) {
    console.error('Error:', err);
  }
})();