require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkData() {
    const pool = mysql.createPool(process.env.MYSQL_URL);
    try {
        console.log('--- Checking Data Counts ---');
        
        const tables = ['users', 'clients', 'packages', 'orders', 'order_assignments', 'commission_rules', 'transactions', 'order_contents'];
        for (const table of tables) {
            try {
                const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`${table}: ${rows[0].count} rows`);
            } catch (e) {
                console.log(`${table}: Error/Not Found (${e.message})`);
            }
        }

        console.log('\n--- Checking Orders Data Sample ---');
        const [orders] = await pool.query('SELECT id, client_id, package_id, status FROM orders LIMIT 5');
        console.log('Orders:', orders);

        if (orders.length > 0) {
            console.log('\n--- Verifying Order Relationships ---');
            const sampleOrder = orders[0];
            
            // Check Client
            const [client] = await pool.query('SELECT id, name FROM clients WHERE id = ?', [sampleOrder.client_id]);
            console.log(`Order #${sampleOrder.id} Client ID ${sampleOrder.client_id}:`, client.length ? `Found (${client[0].name})` : 'NOT FOUND');

            // Check Package
            const [pkg] = await pool.query('SELECT id, name FROM packages WHERE id = ?', [sampleOrder.package_id]);
            console.log(`Order #${sampleOrder.id} Package ID ${sampleOrder.package_id}:`, pkg.length ? `Found (${pkg[0].name})` : 'NOT FOUND');
        }

    } catch (e) {
        console.error('Connection Error:', e);
    } finally {
        await pool.end();
    }
}

checkData();
