
const mysql = require('mysql2/promise');

async function checkData() {
    const pool = mysql.createPool({
        host: '127.0.0.1',
        user: 'nyaladigitaldb',
        password: 'passwordku',
        database: 'nyaladigitaldb',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        console.log("--- Latest Order ---");
        const [orders] = await pool.query('SELECT id, package_id, service_type, created_at FROM orders ORDER BY id DESC LIMIT 1');
        console.log(orders);

        if (orders.length > 0) {
            const orderId = orders[0].id;
            console.log(`\n--- Assignments for Order ${orderId} ---`);
            const [assignments] = await pool.query('SELECT * FROM order_assignments WHERE order_id = ?', [orderId]);
            console.log(assignments);

            console.log(`\n--- Commission Rules for Package ${orders[0].package_id} ---`);
            const [rules] = await pool.query('SELECT * FROM commission_rules WHERE package_id = ?', [orders[0].package_id]);
            console.log(rules);

            // Test Insert
            console.log("\n--- Testing Assignment Insert ---");
            await pool.execute('DELETE FROM order_assignments WHERE order_id = ?', [orderId]);
            
            // Try inserting 'cs' (lowercase)
            await pool.execute("INSERT INTO order_assignments (order_id, user_id, role, content_type) VALUES (?, ?, 'cs', 'general')", [orderId, 1]); // Assuming user 1 exists
            
            console.log("Inserted 'cs'. Checking commissions...");
            const [comm1] = await pool.query(`
                SELECT oa.role, cr.role as rule_role, cr.amount 
                FROM order_assignments oa
                JOIN orders o ON o.id = oa.order_id
                LEFT JOIN commission_rules cr ON 
                    cr.package_id = o.package_id AND 
                    cr.role = oa.role AND 
                    (cr.content_type = oa.content_type OR (cr.content_type = 'general' AND oa.content_type IS NULL))
                WHERE oa.order_id = ?
            `, [orderId]);
            console.log(comm1);

            // Try inserting 'CS' (uppercase)
            await pool.execute('DELETE FROM order_assignments WHERE order_id = ?', [orderId]);
            await pool.execute("INSERT INTO order_assignments (order_id, user_id, role, content_type) VALUES (?, ?, 'CS', 'general')", [orderId, 1]);
            
            console.log("Inserted 'CS'. Checking commissions...");
            const [comm2] = await pool.query(`
                SELECT oa.role, cr.role as rule_role, cr.amount 
                FROM order_assignments oa
                JOIN orders o ON o.id = oa.order_id
                LEFT JOIN commission_rules cr ON 
                    cr.package_id = o.package_id AND 
                    cr.role = oa.role AND 
                    (cr.content_type = oa.content_type OR (cr.content_type = 'general' AND oa.content_type IS NULL))
                WHERE oa.order_id = ?
            `, [orderId]);
            console.log(comm2);
        }


    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkData();
