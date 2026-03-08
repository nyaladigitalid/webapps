require('dotenv').config();
const mysql = require('mysql2/promise');
const http = require('http');

async function checkOrdersSchema() {
    const pool = mysql.createPool(process.env.MYSQL_URL);
    try {
        console.log('--- Checking Orders Table Schema ---');
        const [columns] = await pool.query('DESCRIBE orders');
        const colNames = columns.map(c => c.Field);
        console.log('Columns:', colNames.join(', '));
        
        console.log('\n--- Testing /api/orders Endpoint ---');
        // We can't easily test the running server from here without knowing if it's running.
        // But we can simulate the query logic.
        
        const limit = 5;
        const offset = 0;
        
        let query = `
            SELECT o.*, c.name as client_name, c.business_name, c.whatsapp as client_whatsapp, 
            p.name as package_name, p.price as package_price
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
            ORDER BY o.created_at DESC LIMIT ? OFFSET ?
        `;
        
        const [rows] = await pool.query(query, [limit, offset]);
        console.log(`Fetched ${rows.length} rows.`);
        if (rows.length > 0) {
            console.log('Sample Row Keys:', Object.keys(rows[0]));
            console.log('Sample Row Data (Partial):', {
                id: rows[0].id,
                client_name: rows[0].client_name,
                package_name: rows[0].package_name,
                client_whatsapp: rows[0].client_whatsapp
            });
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

checkOrdersSchema();
