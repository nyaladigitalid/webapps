const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const url = process.env.MYSQL_URL;
    if (!url) {
        console.error('MYSQL_URL not set');
        process.exit(1);
    }
    const conn = await mysql.createConnection(url);

    const users = [
        { name: 'Super Admin', email: 'admin@nyala.local', role: 'super_admin', password: 'admin' },
        { name: 'CS Staff', email: 'cs@nyala.local', role: 'cs', password: 'cs' },
        { name: 'Keuangan Staff', email: 'finance@nyala.local', role: 'keuangan', password: 'finance' },
        { name: 'Editor Staff', email: 'editor@nyala.local', role: 'editor', password: 'editor' },
        { name: 'Advertiser Staff', email: 'ads@nyala.local', role: 'advertiser', password: 'ads' },
        { name: 'CRM Staff', email: 'crm@nyala.local', role: 'crm', password: 'crm' }
    ];

    try {
        for (const u of users) {
            console.log(`Upserting ${u.email}...`);
            // Check if exists
            const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [u.email]);
            if (rows.length > 0) {
                await conn.execute(
                    'UPDATE users SET name = ?, role = ?, password_hash = ? WHERE email = ?',
                    [u.name, u.role, u.password, u.email]
                );
            } else {
                await conn.execute(
                    'INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)',
                    [u.name, u.email, u.role, u.password]
                );
            }
        }
        console.log('Users setup complete.');
    } catch (e) {
        console.error(e);
    } finally {
        await conn.end();
    }
}

run();
