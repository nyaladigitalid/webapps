
require('dotenv').config();
const mysql = require('mysql2/promise');

async function debugOrders() {
    try {
        const pool = mysql.createPool(process.env.MYSQL_URL);
        console.log('Connected to DB');

        // 1. Check Orders Count
        const [count] = await pool.query('SELECT COUNT(*) as total FROM orders');
        console.log('Total Orders:', count[0].total);

        if (count[0].total > 0) {
            // 2. Check Raw Order Data
            const [rows] = await pool.query('SELECT * FROM orders LIMIT 1');
            console.log('Raw Order Sample:', rows[0]);

            // 3. Check Join Query (as used in server.js)
            const query = `
                SELECT o.*, c.name as client_name, c.business_name, c.whatsapp as client_whatsapp, 
                p.name as package_name, p.price as package_price
                FROM orders o
                LEFT JOIN clients c ON o.client_id = c.id
                LEFT JOIN packages p ON o.package_id = p.id
                LIMIT 1
            `;
            const [joined] = await pool.query(query);
            console.log('Joined Order Sample:', joined[0]);
        } else {
            console.log('No orders found.');
        }

        await pool.end();
    } catch (e) {
        console.error('Error:', e);
    }
}

debugOrders();
