
// --- Scalev Webhook Integration ---

// Create table if not exists
async function createScalevTable() {
    try {
        const p = await getPool();
        await p.query(`
            CREATE TABLE IF NOT EXISTS scalev_orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                scalev_order_id VARCHAR(50) NOT NULL,
                invoice_number VARCHAR(100),
                customer_name VARCHAR(191),
                customer_phone VARCHAR(50),
                customer_email VARCHAR(191),
                payment_method VARCHAR(50),
                payment_status VARCHAR(50),
                total_amount DECIMAL(15, 2),
                items TEXT,
                status VARCHAR(50),
                raw_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (scalev_order_id),
                INDEX (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Scalev orders table ready');
    } catch (e) {
        console.error('Error creating scalev table:', e);
    }
}
createScalevTable();

app.post('/api/webhooks/scalev', async (req, res) => {
    ensureEnv();
    try {
        const payload = req.body;
        console.log('Webhook received:', JSON.stringify(payload).substring(0, 200) + '...');
        
        // 1. Handle Test Event
        if (payload.event === 'business.test_event') {
            console.log('Scalev Test Event Received');
            return res.status(200).json({ message: 'OK' });
        }

        // 2. Handle Order Created
        if (payload.event === 'order.created') {
            const data = payload.data;
            const p = await getPool();
            
            // Extract relevant fields
            const orderId = data.order_id;
            const invoice = data.invoice_number || orderId; // Fallback
            const customerName = data.destination_address?.name || 'Unknown';
            const customerPhone = data.destination_address?.phone || '';
            const customerEmail = data.destination_address?.email || '';
            const total = data.net_revenue || data.gross_revenue || 0;
            const status = data.status || 'pending';
            const items = JSON.stringify(data.orderlines || []);
            const paymentMethod = data.payment_method || '';
            const paymentStatus = data.payment_status || 'unpaid';

            // Insert into scalev_orders
            await p.query(`
                INSERT INTO scalev_orders 
                (scalev_order_id, invoice_number, customer_name, customer_phone, customer_email, 
                 payment_method, payment_status, total_amount, items, status, raw_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId, invoice, customerName, customerPhone, customerEmail,
                paymentMethod, paymentStatus, total, items, status, JSON.stringify(payload)
            ]);
            
            console.log(`Scalev Order Saved: ${orderId}`);
            return res.status(200).json({ success: true });
        }

        // Other events - just return 200 to acknowledge
        res.status(200).json({ received: true });

    } catch (e) {
        console.error('Webhook Error:', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.get('/api/scalev/orders', async (req, res) => {
    ensureEnv();
    try {
        const p = await getPool();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [rows] = await p.query(`
            SELECT SQL_CALC_FOUND_ROWS * FROM scalev_orders 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const [countResult] = await p.query('SELECT FOUND_ROWS() as total');
        const total = countResult[0].total;

        res.json({
            data: rows,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});
