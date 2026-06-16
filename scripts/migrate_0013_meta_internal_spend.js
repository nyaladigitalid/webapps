const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Running migration: modify campaigns, ad_accounts, and transactions schemas...');

    // 1. Make campaigns.order_id and client_id nullable
    console.log('Modifying campaigns table columns to be nullable...');
    try {
      await connection.query(`ALTER TABLE campaigns MODIFY order_id INT NULL`);
      console.log('campaigns.order_id is now nullable.');
    } catch (e) {
      console.error('Failed to modify campaigns.order_id:', e.message);
    }

    try {
      await connection.query(`ALTER TABLE campaigns MODIFY client_id INT NULL`);
      console.log('campaigns.client_id is now nullable.');
    } catch (e) {
      console.error('Failed to modify campaigns.client_id:', e.message);
    }

    // 2. Add is_internal to ad_accounts
    console.log('Adding is_internal column to ad_accounts table...');
    try {
      await connection.query(`ALTER TABLE ad_accounts ADD COLUMN is_internal TINYINT(1) DEFAULT 0`);
      console.log('Added is_internal column to ad_accounts.');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('is_internal column already exists in ad_accounts.');
      } else {
        console.error('Failed to add is_internal column to ad_accounts:', e.message);
      }
    }

    // 3. Add campaign_id to transactions
    console.log('Adding campaign_id column to transactions table...');
    try {
      await connection.query(`ALTER TABLE transactions ADD COLUMN campaign_id VARCHAR(100) NULL`);
      console.log('Added campaign_id column to transactions.');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('campaign_id column already exists in transactions.');
      } else {
        console.error('Failed to add campaign_id column to transactions:', e.message);
      }
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

run();
