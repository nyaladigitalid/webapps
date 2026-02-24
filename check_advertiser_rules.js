require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkAdvertiserRules() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        console.log('Connected to database.');

        const [rows] = await connection.query(`
            SELECT cr.*, p.name as package_name 
            FROM commission_rules cr
            LEFT JOIN packages p ON p.id = cr.package_id
            WHERE cr.role = 'Advertiser'
        `);

        console.log('Advertiser Commission Rules:', rows);
        
        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkAdvertiserRules();