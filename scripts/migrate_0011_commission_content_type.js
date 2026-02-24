const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Running migration: update commission_rules table with content_type...');
    
    // Check if column exists
    const [cols] = await connection.query(`SHOW COLUMNS FROM commission_rules LIKE 'content_type'`);
    if (cols.length === 0) {
        await connection.query(`ALTER TABLE commission_rules ADD COLUMN content_type VARCHAR(50) NOT NULL DEFAULT 'general' AFTER role`);
        console.log('Added column content_type');
    }

    // Update Unique Key
    // First, check if index exists and drop it
    try {
        await connection.query(`ALTER TABLE commission_rules DROP INDEX unique_pkg_role`);
        console.log('Dropped old unique index');
    } catch (e) {
        // Ignore if not exists
        console.log('Index unique_pkg_role might not exist or already dropped');
    }

    // Add new unique index
    try {
        await connection.query(`CREATE UNIQUE INDEX unique_pkg_role_type ON commission_rules (package_id, role, content_type)`);
        console.log('Created new unique index unique_pkg_role_type');
    } catch (e) {
        console.log('Index unique_pkg_role_type might already exist', e.message);
    }
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

run();