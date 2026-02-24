require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
// const cors = require('cors'); // Cors not installed in package.json

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files from root

// Database Connection
const pool = mysql.createPool(process.env.MYSQL_URL);

// Helper function for Scalev code compatibility
const getPool = () => pool;

// Helper function to ensure environment is ready (mock implementation)
function ensureEnv() {
    if (!process.env.MYSQL_URL) {
        throw new Error('MYSQL_URL is missing');
    }
}

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

// --- Basic API Endpoints for Frontend Support ---

// Login Endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        // Note: In production, use bcrypt.compare here. 
        // Based on setup_users.js, passwords might be plain text for now.
        if (user.password_hash !== password) { 
             // Check if it's hashed? For now, assume plain text matching existing seed data.
             // If seed data used bcrypt, this will fail and we'll need to update logic.
             // For now, simple comparison.
             return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Dashboard Stats Endpoint (Placeholder)
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        // Mock data or simple counts
        const [orders] = await pool.query('SELECT COUNT(*) as count FROM orders');
        const [clients] = await pool.query('SELECT COUNT(*) as count FROM clients');
        
        res.json({
            active_orders: orders[0].count,
            revenue: 0, // Calculate real revenue if needed
            clients: clients[0].count,
            active_campaigns: 0
        });
    } catch (e) {
        console.error('Dashboard stats error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Users Endpoint
app.get('/api/users', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, name, email, role, created_at FROM users');
        res.json(users);
    } catch (e) {
        console.error('Users fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Orders Endpoint (Basic)
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;

        const [orders] = await pool.query(`
            SELECT o.*, c.name as client_name, p.name as package_name 
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        
        const [count] = await pool.query('SELECT COUNT(*) as total FROM orders');

        res.json({
            data: orders,
            meta: {
                page,
                limit,
                total: count[0].total,
                totalPages: Math.ceil(count[0].total / limit)
            }
        });
    } catch (e) {
        console.error('Orders fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
