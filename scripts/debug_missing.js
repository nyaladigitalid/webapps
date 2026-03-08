
const mysql = require('mysql2/promise');
require('dotenv').config();

async function debugData() {
    try {
        const pool = mysql.createPool(process.env.MYSQL_URL);
        console.log('Connected to DB');

        // 1. Check Users
        try {
            const [users] = await pool.query('SELECT COUNT(*) as count FROM users');
            console.log('Total Users:', users[0].count);
            if (users[0].count > 0) {
                const [sampleUser] = await pool.query('SELECT * FROM users LIMIT 1');
                console.log('Sample User:', sampleUser[0]);
            }
        } catch (e) {
            console.error('Error checking users:', e.message);
        }

        // 2. Check Orders Query (Simulate API)
        try {
            const query = `
                SELECT o.*, c.name as client_name, c.business_name, c.whatsapp as client_whatsapp, 
                p.name as package_name, p.price as package_price
                FROM orders o
                LEFT JOIN clients c ON o.client_id = c.id
                LEFT JOIN packages p ON o.package_id = p.id
                ORDER BY o.created_at DESC
                LIMIT 5
            `;
            const [orders] = await pool.query(query);
            console.log('Orders Query Result Count (Limit 5):', orders.length);
            if (orders.length > 0) {
                console.log('Sample Order Raw:', orders[0]);
                
                // Simulate Frontend Mapping
                const mapped = orders.map(o => {
                    let meta = o.meta_data;
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch(e) {}
                    }
                    return {
                        id: o.id,
                        created_at: o.created_at, // Check type
                        startDate: o.start_date || o.created_at,
                        status: o.status
                    };
                });
                console.log('Mapped Order Sample:', mapped[0]);
                console.log('created_at type:', typeof mapped[0].created_at);
                console.log('created_at value:', mapped[0].created_at);
            }
        } catch (e) {
            console.error('Error checking orders query:', e.message);
        }

        // 3. Check Campaigns (if exists)
        try {
            const [tables] = await pool.query("SHOW TABLES LIKE 'campaigns'");
            if (tables.length > 0) {
                const [camps] = await pool.query('SELECT COUNT(*) as count FROM campaigns');
                console.log('Total Campaigns:', camps[0].count);
            } else {
                console.log('Table "campaigns" does not exist.');
            }
        } catch (e) {
            console.error('Error checking campaigns:', e.message);
        }

        await pool.end();

    } catch (e) {
        console.error('General Error:', e);
    }
}

debugData();
