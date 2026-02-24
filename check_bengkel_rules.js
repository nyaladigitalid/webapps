require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkBengkelRules() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        console.log('Connected to database.');

        const [rows] = await connection.query(`
            SELECT cr.*, p.name as package_name 
            FROM commission_rules cr
            LEFT JOIN packages p ON p.id = cr.package_id
            WHERE cr.role LIKE '%Bengkel%' OR cr.role LIKE '%Technical%'
        `);

        console.log('Bengkel/Technical Commission Rules:', rows);
        
        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkBengkelRules();