require('dotenv').config();
const mysql = require('mysql2/promise');

async function testImprovement() {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        console.log('Connected to database.');

        // 1. Get a valid campaign and order
        const [rows] = await connection.query(`
            SELECT c.id, c.order_id, c.campaign_name, o.package_id 
            FROM campaigns c 
            JOIN orders o ON c.order_id = o.id 
            LIMIT 1
        `);
        
        if (rows.length === 0) {
            console.log('No campaigns found to test.');
            await connection.end();
            return;
        }

        const campaign = rows[0];
        console.log('Testing with Campaign:', campaign);

        // 2. Simulate Improvement Submission
        const payload = {
            userId: 1, // Assuming Super Admin or valid user ID
            details: 'Optimization: Changed age range and added interest "Business".',
            date: new Date().toISOString().split('T')[0]
        };

        console.log('Sending Payload:', payload);

        // Use global fetch (Node 18+)
        const response = await fetch(`http://localhost:3000/api/campaigns/${campaign.id}/improvements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('API Response:', result);

        if (result.success) {
            // 3. Verify Database Records
            const [impRows] = await connection.query('SELECT * FROM campaign_improvements WHERE campaign_id = ? ORDER BY id DESC LIMIT 1', [campaign.id]);
            console.log('Improvement Record:', impRows[0]);

            // Check for assignment
            // Note: role='Team Bengkel'
            const [assignRows] = await connection.query('SELECT * FROM order_assignments WHERE order_id = ? AND role = "Team Bengkel" ORDER BY id DESC LIMIT 1', [campaign.order_id]);
            console.log('Assignment Record:', assignRows[0]);
        } else {
            console.error('API Error:', result.error);
        }

        await connection.end();

    } catch (error) {
        console.error('Test Error:', error);
    }
}

testImprovement();