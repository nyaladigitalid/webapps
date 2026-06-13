
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function checkCommissions() {
    const pool = mysql.createPool(process.env.DATABASE_URL || process.env.MYSQL_URL);

    console.log('=== Cek Data commission_ledger ===');
    const [ledgerRows] = await pool.query('SELECT * FROM commission_ledger ORDER BY created_at DESC LIMIT 10');
    console.log('Jumlah data:', ledgerRows.length);
    ledgerRows.forEach(r => {
        console.log(`- ID: ${r.id}, user_id: ${r.user_id}, role: ${r.role}, amount: ${r.amount}, status: ${r.status}, approval_status: ${r.approval_status}`);
    });

    console.log('\n=== Cek Data commission_rules ===');
    const [rulesRows] = await pool.query('SELECT * FROM commission_rules');
    console.log('Jumlah data:', rulesRows.length);
    rulesRows.forEach(r => {
        console.log(`- ID: ${r.id}, package_id: ${r.package_id}, role: ${r.role}, content_type: ${r.content_type}, amount: ${r.amount}`);
    });

    await pool.end();
}

checkCommissions().catch(console.error);

