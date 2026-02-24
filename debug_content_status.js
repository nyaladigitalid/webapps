const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        
        // 1. Get latest order
        const [orders] = await connection.query('SELECT id, status FROM orders ORDER BY id DESC LIMIT 1');
        if (orders.length === 0) {
            console.log('No orders found');
            await connection.end();
            return;
        }
        const orderId = orders[0].id;
        console.log(`Checking Order ID: ${orderId} (Order Status: ${orders[0].status})`);

        // 2. Check order_contents
        const [contents] = await connection.query('SELECT * FROM order_contents WHERE order_id = ?', [orderId]);
        console.log('Order Contents:', contents);

        // 3. Check order_content_links
        const [links] = await connection.query('SELECT * FROM order_content_links WHERE order_id = ?', [orderId]);
        console.log('Order Content Links:', links);

        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
})();
