const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  try {
    console.log('Cleaning up duplicate rows in ad_accounts...');

    // 1. Delete duplicates, keeping only the first row (min id) for each account_id
    const [delResult] = await connection.query(`
      DELETE a1 FROM ad_accounts a1
      INNER JOIN ad_accounts a2 
      WHERE a1.id > a2.id AND a1.account_id = a2.account_id
    `);
    console.log(`Removed duplicate rows. Affected rows: ${delResult.affectedRows}`);

    // 2. Add the unique key constraint
    console.log('Adding UNIQUE KEY constraint to ad_accounts.account_id...');
    try {
      await connection.query(`ALTER TABLE ad_accounts ADD UNIQUE KEY uniq_ad_account_id (account_id)`);
      console.log('Successfully added UNIQUE KEY uniq_ad_account_id on account_id.');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('UNIQUE KEY uniq_ad_account_id already exists.');
      } else {
        console.error('Failed to add unique key:', e.message);
      }
    }

    console.log('Cleanup finished successfully.');
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await connection.end();
  }
}

run();
