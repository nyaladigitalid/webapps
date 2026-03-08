const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTables() {
    try {
        const pool = mysql.createPool(process.env.MYSQL_URL);

        console.log("\nChecking order_details count vs orders count...");
        const [ordersCount] = await pool.query('SELECT COUNT(*) as c FROM orders');
        const [detailsCount] = await pool.query('SELECT COUNT(*) as c FROM order_details');
        const [targetsCount] = await pool.query('SELECT COUNT(*) as c FROM order_targets');
        
        console.log(`Orders: ${ordersCount[0].c}`);
        console.log(`Details: ${detailsCount[0].c}`);
        console.log(`Targets: ${targetsCount[0].c}`);

        console.log("\nFinding a Golden Sample Order...");
         const [rows] = await pool.query(`
            SELECT o.id, 
                   (SELECT COUNT(*) FROM order_details od WHERE od.order_id = o.id) as details_count,
                   (SELECT COUNT(*) FROM order_assignments oa WHERE oa.order_id = o.id) as assignments_count,
                   (SELECT COUNT(*) FROM campaigns c WHERE c.order_id = o.id) as campaigns_count
            FROM orders o
            HAVING details_count > 0 AND assignments_count > 0 AND campaigns_count > 0
            LIMIT 5
         `);
         
         if (rows.length > 0) {
             console.log("Found complete orders:", rows);
         } else {
             console.log("No order found with Details + Assignments + Campaigns.");
             
             console.log("Checking orders with just Campaigns...");
             const [campOrders] = await pool.query(`
                SELECT o.id, (SELECT COUNT(*) FROM campaigns c WHERE c.order_id = o.id) as cnt 
                FROM orders o HAVING cnt > 0 LIMIT 5
             `);
             console.log(campOrders);

             console.log("Checking orders with just Assignments...");
             const [assignOrders] = await pool.query(`
                SELECT o.id, (SELECT COUNT(*) FROM order_assignments oa WHERE oa.order_id = o.id) as cnt 
                FROM orders o HAVING cnt > 0 LIMIT 5
             `);
             console.log(assignOrders);
         }

        await pool.end();
    } catch (e) {
        console.error("Error:", e);
    }
}

checkTables();
