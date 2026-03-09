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

// Dashboard Stats Endpoint
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const { role, user_id } = req.query;
        const userId = parseInt(user_id);

        let stats = {
            activeOrders: 0,
            revenueThisMonth: 0,
            newClientsThisMonth: 0,
            activeCampaigns: 0,
            // Role specific
            assignedOrders: 0,
            commission: 0,
            expiryCount: 0,
            pendingTasks: 0,
            completedTasks: 0
        };

        // Global Stats (for Admin)
        if (!role || role === 'super_admin' || role === 'Super Admin') {
            const [ordersCount] = await pool.query("SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled'");
            const [clientsCount] = await pool.query("SELECT COUNT(*) as count FROM clients WHERE MONTH(created_at) = MONTH(CURRENT_DATE())");
            // Mock revenue
            const [rev] = await pool.query("SELECT SUM(p.price) as total FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.payment_status = 'paid' AND MONTH(o.created_at) = MONTH(CURRENT_DATE())");
            
            stats.activeOrders = ordersCount[0].count;
            stats.newClientsThisMonth = clientsCount[0].count;
            stats.revenueThisMonth = rev[0].total || 0;
            stats.activeCampaigns = 0; // Need campaigns table for this
        }

        if (role === 'CS' && userId) {
            // Active Orders for this CS
            const [myOrders] = await pool.query(`
                SELECT COUNT(DISTINCT o.id) as count 
                FROM orders o 
                JOIN order_assignments oa ON o.id = oa.order_id 
                WHERE oa.user_id = ? AND oa.role = 'CS' AND o.status IN ('active', 'in_progress', 'pending')
            `, [userId]);
            stats.activeOrders = myOrders[0].count; // Reusing field name but means "My Active Orders"
            
            // Commission (Mock calculation)
            // Assuming commission rules are simple for now
            const [comm] = await pool.query(`
                SELECT COUNT(DISTINCT o.id) * 50000 as total 
                FROM orders o 
                JOIN order_assignments oa ON o.id = oa.order_id 
                WHERE oa.user_id = ? AND oa.role = 'CS' AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
            `, [userId]);
            stats.commission = comm[0].total || 0;
            
            // Expiry (H-2) - Mock logic (orders created 28 days ago assuming 30 day cycle)
            stats.expiryCount = 0; 
        } 
        else if ((role === 'Editor' || role === 'Editor Video' || role === 'Editor Image') && userId) {
             // Pending Tasks
             const [tasks] = await pool.query(`
                SELECT COUNT(DISTINCT o.id) as count
                FROM orders o
                JOIN order_assignments oa ON o.id = oa.order_id
                WHERE oa.user_id = ? AND (oa.role LIKE '%Editor%') 
                AND o.status NOT IN ('completed', 'cancelled')
             `, [userId]);
             stats.pendingTasks = tasks[0].count;
             
             // Completed this month
             const [completed] = await pool.query(`
                SELECT COUNT(DISTINCT o.id) as count
                FROM orders o
                JOIN order_assignments oa ON o.id = oa.order_id
                WHERE oa.user_id = ? AND (oa.role LIKE '%Editor%') 
                AND o.status = 'completed' AND MONTH(o.updated_at) = MONTH(CURRENT_DATE())
             `, [userId]);
             stats.completedTasks = completed[0].count;
        }
        else if (role === 'Advertiser' && userId) {
            const [myAds] = await pool.query(`
                SELECT COUNT(DISTINCT o.id) as count 
                FROM orders o 
                JOIN order_assignments oa ON o.id = oa.order_id 
                WHERE oa.user_id = ? AND oa.role = 'Advertiser' AND o.status = 'active'
            `, [userId]);
            stats.activeCampaigns = myAds[0].count;
        }
        else if ((role === 'Team Bengkel' || role === 'Bengkel') && userId) {
             const [tasks] = await pool.query(`
                SELECT COUNT(DISTINCT o.id) as count
                FROM orders o
                JOIN order_assignments oa ON o.id = oa.order_id
                WHERE oa.user_id = ? AND oa.role = 'Team Bengkel'
                AND o.status NOT IN ('completed', 'cancelled')
             `, [userId]);
             stats.pendingTasks = tasks[0].count;
        }

        res.json(stats);
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

// Clients Endpoint
app.get('/api/clients', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const q = req.query.q || '';

        let query = `
                    SELECT c.*, 
                    (
                        SELECT u.name 
                        FROM orders o 
                        JOIN order_assignments oa ON o.id = oa.order_id 
                        JOIN users u ON oa.user_id = u.id 
                        WHERE o.client_id = c.id 
                        ORDER BY o.created_at DESC 
                        LIMIT 1
                    ) as cs_names
                    FROM clients c
                `;
                
                const params = [];

                if (q) {
                    query += ' WHERE c.name LIKE ? OR c.business_name LIKE ?';
                    params.push(`%${q}%`, `%${q}%`);
                }

                query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
                params.push(limit, offset);

                const [clients] = await pool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(DISTINCT c.id) as total FROM clients c';
        const countParams = [];
        
        if (q) {
            countQuery += ' WHERE c.name LIKE ? OR c.business_name LIKE ?';
            countParams.push(`%${q}%`, `%${q}%`);
        }
        
        const [countResult] = await pool.query(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            data: clients,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (e) {
        console.error('Clients fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/clients', async (req, res) => {
    try {
        const { name, businessName, businessType, whatsapp, address } = req.body;
        
        if (!name || !businessName) {
            return res.status(400).json({ error: 'Name and Business Name are required' });
        }

        const [result] = await pool.query(
            'INSERT INTO clients (name, business_name, business_type, whatsapp, address) VALUES (?, ?, ?, ?, ?)',
            [name, businessName, businessType, whatsapp, address]
        );

        res.json({ id: result.insertId, message: 'Client added successfully' });
    } catch (e) {
        console.error('Add client error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Packages Endpoint
app.get('/api/packages', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM packages ORDER BY name ASC');
        res.json(rows);
    } catch (e) {
        console.error('Packages fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Campaigns Endpoints
app.get('/api/campaigns', async (req, res) => {
    try {
        const status = req.query.status || '';
        const order_id = req.query.order_id || '';
        const page = parseInt(req.query.page || '0');
        const limit = parseInt(req.query.limit || '0');
        const offset = page > 0 && limit > 0 ? (page - 1) * limit : 0;

        let baseQuery = `
            SELECT c.*,
                   CASE WHEN c.results > 0 THEN (c.spend / c.results) ELSE 0 END AS cpr
            FROM campaigns c
        `;

        let params = [];
        let whereClauses = [];
        if (status) {
            whereClauses.push(`c.status = ?`);
            params.push(status);
        }
        if (order_id) {
            whereClauses.push(`c.order_id = ?`);
            params.push(order_id);
        }
        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ` + whereClauses.join(' AND ');
        }
        baseQuery += ` ORDER BY cpr DESC, c.created_at DESC`;

        if (page > 0 && limit > 0) {
            const pagedQuery = baseQuery + ` LIMIT ? OFFSET ?`;
            const dataParams = params.concat([limit, offset]);
            const [rows] = await pool.query(pagedQuery, dataParams);

            let countQuery = `SELECT COUNT(*) as total FROM campaigns c`;
            if (whereClauses.length > 0) {
                countQuery += ` WHERE ` + whereClauses.join(' AND ');
            }
            const [countRows] = await pool.query(countQuery, params);
            const total = countRows[0].total || 0;

            return res.json({
                data: rows,
                meta: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } else {
            const [rows] = await pool.query(baseQuery, params);
            return res.json(rows);
        }
    } catch (e) {
        console.error('Campaigns fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/campaigns/:id/sync', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE campaigns SET updated_at = NOW() WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Campaign sync error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Campaign Creation (basic stub)
app.post('/api/campaigns/create', async (req, res) => {
    try {
        const {
            name,
            ad_account_id,
            page_id,
            duration,
            business_name,
            client_id,
            order_id
        } = req.body || {};

        if (!name || !ad_account_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const campaignId = `LOCAL-${Date.now()}`;
        await pool.query(
            `INSERT INTO campaigns (order_id, client_id, campaign_id, campaign_name, ad_account_id, status, impressions, clicks, ctr, spend, results, created_at, updated_at, result_type)
             VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, 0, 0, 0, 0, NOW(), NOW(), 'Results')`,
            [order_id || null, client_id || null, campaignId, name, ad_account_id]
        );

        res.json({ success: true, campaign_id: campaignId });
    } catch (e) {
        console.error('Campaign create error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Campaigns by Order
app.get('/api/orders/:id/campaigns', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(
            'SELECT * FROM campaigns WHERE order_id = ? ORDER BY created_at DESC',
            [id]
        );
        res.json(rows);
    } catch (e) {
        console.error('Order campaigns error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Meta Ads basic config (stub for UI dropdowns)
app.get('/api/meta-config', async (_req, res) => {
    try {
        const [accounts] = await pool.query('SELECT account_id as id, name FROM ad_accounts ORDER BY name ASC');
        const [fanspages] = await pool.query('SELECT fanspage_id as id, name FROM fanspages ORDER BY name ASC');
        let pixel_id = '';
        const [cfg] = await pool.query('SELECT pixel_id FROM meta_ads_configs LIMIT 1');
        if (cfg.length > 0 && cfg[0].pixel_id) {
            pixel_id = cfg[0].pixel_id;
        }

        res.json({
            accounts,
            fanspages,
            pixel_id
        });
    } catch (e) {
        console.error('Meta config fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/meta-config', async (req, res) => {
    try {
        const { accounts, pixel_id } = req.body;
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            if (pixel_id !== undefined) {
                let configId = 1;
                const [configs] = await connection.query('SELECT id FROM meta_ads_configs LIMIT 1');
                if (configs.length > 0) {
                    configId = configs[0].id;
                } else {
                    const [resCreate] = await connection.query("INSERT INTO meta_ads_configs (name) VALUES ('Default')");
                    configId = resCreate.insertId;
                }
                await connection.query('UPDATE meta_ads_configs SET pixel_id = ? WHERE id = ?', [pixel_id, configId]);
            }

            if (Array.isArray(accounts)) {
                 let configId = 1;
                 const [configs] = await connection.query("SELECT id FROM meta_ads_configs LIMIT 1");
                 if (configs.length > 0) {
                     configId = configs[0].id;
                 } else {
                     const [res] = await connection.query("INSERT INTO meta_ads_configs (name) VALUES ('Default')");
                     configId = res.insertId;
                 }

                 for (const acc of accounts) {
                     if (acc.deleted) {
                         await connection.query("DELETE FROM ad_accounts WHERE account_id = ?", [acc.id]);
                     } else {
                         await connection.query(
                             "INSERT INTO ad_accounts (config_id, account_id, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
                             [configId, acc.id, acc.name]
                         );
                     }
                 }
            }

            await connection.commit();
            res.json({ success: true });
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }
    } catch (e) {
        console.error('Meta config save error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Orders Endpoint (Enhanced)
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { assigned_to, role, status } = req.query;

        let query = `
            SELECT o.*, c.name as client_name, c.business_name, c.whatsapp as client_whatsapp, 
            p.name as package_name, p.price as package_price
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
        `;
        
        const params = [];
        let whereClauses = [];

        if (assigned_to && role) {
            query += ` JOIN order_assignments oa ON o.id = oa.order_id `;
            whereClauses.push(`oa.user_id = ?`);
            params.push(assigned_to);
            if (role === 'CS') whereClauses.push(`oa.role = 'CS'`);
            else if (role === 'Advertiser') whereClauses.push(`oa.role = 'Advertiser'`);
            else if (role.includes('Editor')) whereClauses.push(`oa.role LIKE '%Editor%'`);
            else if (role === 'Team Bengkel' || role === 'Bengkel') whereClauses.push(`oa.role = 'Team Bengkel'`);
        }

        if (status) {
            whereClauses.push(`o.status = ?`);
            params.push(status);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ` + whereClauses.join(' AND ');
        }

        query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [orders] = await pool.query(query, params);
        
        // Count Query
        let countQuery = 'SELECT COUNT(DISTINCT o.id) as total FROM orders o';
        const countParams = [];
        let countWhere = [];

        if (assigned_to && role) {
            countQuery += ` JOIN order_assignments oa ON o.id = oa.order_id `;
            countWhere.push(`oa.user_id = ?`);
            countParams.push(assigned_to);
             if (role === 'CS') countWhere.push(`oa.role = 'CS'`);
            else if (role === 'Advertiser') countWhere.push(`oa.role = 'Advertiser'`);
            else if (role.includes('Editor')) countWhere.push(`oa.role LIKE '%Editor%'`);
            else if (role === 'Team Bengkel' || role === 'Bengkel') countWhere.push(`oa.role = 'Team Bengkel'`);
        }

        if (status) {
            countWhere.push(`o.status = ?`);
            countParams.push(status);
        }

        if (countWhere.length > 0) {
            countQuery += ` WHERE ` + countWhere.join(' AND ');
        }

        const [count] = await pool.query(countQuery, countParams);

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

app.post('/api/orders', async (req, res) => {
    ensureEnv();

    const connection = await pool.getConnection();
    try {
        const body = req.body || {};
        const clientPayload = body.client || {};
        const detailsPayload = body.details || {};
        const targetsPayload = body.targets || {};
        const orderPayload = body.order || {};

        const userRole = (body.userRole || body.user_role || '').toString().toLowerCase();

        const packageId = orderPayload.packageId || orderPayload.package_id || body.packageId || body.package_id;
        if (!packageId) {
            return res.status(400).json({ error: 'packageId is required' });
        }

        let clientId = body.clientId || body.client_id || clientPayload.id || clientPayload.client_id;
        if (!clientId) {
            const name = clientPayload.name || '';
            const businessName = clientPayload.businessName || clientPayload.business_name || null;
            const businessType = clientPayload.businessType || clientPayload.business_type || null;
            const whatsapp = clientPayload.whatsapp || clientPayload.wa || null;
            const address = clientPayload.address || null;

            if (!name) {
                return res.status(400).json({ error: 'client.name is required' });
            }

            const [clientResult] = await connection.query(
                'INSERT INTO clients (name, business_name, business_type, whatsapp, address) VALUES (?, ?, ?, ?, ?)',
                [name, businessName, businessType, whatsapp, address]
            );
            clientId = clientResult.insertId;
        }

        const status = orderPayload.status || 'pending';
        const repeatOrderRaw = orderPayload.repeatOrder ?? orderPayload.repeat_order ?? 0;
        const repeatOrder = repeatOrderRaw === true || repeatOrderRaw === 1 || repeatOrderRaw === '1' || repeatOrderRaw === 'true' ? 1 : 0;

        const serviceType = orderPayload.serviceType || orderPayload.service_type || null;
        const metaDataRaw = orderPayload.metaData ?? orderPayload.meta_data ?? null;
        const metaData = metaDataRaw && typeof metaDataRaw !== 'string' ? JSON.stringify(metaDataRaw) : metaDataRaw;

        const startDate = orderPayload.startDate || orderPayload.start_date || (metaDataRaw && metaDataRaw.startDate) || null;
        const endDate = orderPayload.endDate || orderPayload.end_date || (metaDataRaw && metaDataRaw.endDate) || null;

        await connection.beginTransaction();

        const [orderResult] = await connection.query(
            `INSERT INTO orders (client_id, package_id, status, repeat_order, start_date, end_date, service_type, meta_data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [clientId, packageId, status, repeatOrder, startDate, endDate, serviceType, metaData]
        );

        const orderId = orderResult.insertId;

        const description = detailsPayload.description ?? null;
        const advantages = detailsPayload.advantages ?? null;
        const uniqueness = detailsPayload.uniqueness ?? null;
        const promo = detailsPayload.promo ?? null;

        if (description || advantages || uniqueness || promo) {
            await connection.query(
                'INSERT INTO order_details (order_id, description, advantages, uniqueness, promo) VALUES (?, ?, ?, ?, ?)',
                [orderId, description, advantages, uniqueness, promo]
            );
        }

        const locations = targetsPayload.locations ?? null;
        const ageRange = targetsPayload.ageRange ?? targetsPayload.age_range ?? null;
        const gender = targetsPayload.gender ?? null;

        if (locations || ageRange || gender) {
            await connection.query(
                'INSERT INTO order_targets (order_id, locations, age_range, gender) VALUES (?, ?, ?, ?)',
                [orderId, locations, ageRange, gender]
            );
        }

        const csId = orderPayload.csId || orderPayload.cs_id || null;
        if (userRole === 'super_admin' && csId) {
            let amount = 0;
            const [rules] = await connection.query(
                'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                [packageId, 'CS', 'general']
            );
            if (rules.length > 0 && rules[0].amount != null) {
                amount = rules[0].amount;
            }

            await connection.query(
                `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                 VALUES (?, ?, 'CS', 'general', ?)
                 ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)`,
                [orderId, csId, amount]
            );
        }

        await connection.commit();
        res.json({ success: true, orderId });
    } catch (e) {
        try {
            await connection.rollback();
        } catch (_) {}
        console.error('Create order error:', e);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// Finance Orders Endpoint
app.get('/api/finance/orders', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = `
            SELECT o.*, c.name as client_name, p.name as package_name, p.price as package_price,
            (SELECT COALESCE(SUM(commission_amount), 0) FROM order_assignments WHERE order_id = o.id) as total_commission,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE order_id = o.id AND type = 'expense') as total_spend
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
            WHERE o.payment_status = 'paid'
        `;
        
        const params = [];
        if (startDate && endDate) {
            query += ` AND DATE(o.created_at) BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }

        query += ` ORDER BY o.created_at DESC`;
        
        const [orders] = await pool.query(query, params);
        res.json(orders);
    } catch (e) {
        console.error('Finance orders error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Commission Rules Endpoint
app.get('/api/orders/:id/commissions', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT oa.role, oa.commission_amount as amount, oa.content_type, u.name as user_name
            FROM order_assignments oa
            JOIN users u ON oa.user_id = u.id
            WHERE oa.order_id = ?
        `, [id]);
        res.json(rows);
    } catch (e) {
        console.error('Order commissions error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Commission Rules Endpoint (Original)
app.get('/api/commissions', async (req, res) => {
    try {
        const { package_id } = req.query;
        let query = `
            SELECT cr.*, p.name as package_name, p.category as package_category 
            FROM commission_rules cr
            LEFT JOIN packages p ON cr.package_id = p.id
        `;
        let params = [];

        if (package_id) {
            query += ' WHERE cr.package_id = ?';
            params.push(package_id);
        }

        query += ' ORDER BY p.name ASC, cr.role ASC';

        const [rules] = await pool.query(query, params);
        res.json(rules);
    } catch (e) {
        console.error('Commission rules error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/commissions', async (req, res) => {
    try {
        const { package_id, role, content_type, amount } = req.body;
        if (!package_id || !role || !amount) {
            return res.status(400).json({ error: 'Package, Role, and Amount are required' });
        }

        const type = content_type || 'general';

        // Upsert rule
        await pool.query(`
            INSERT INTO commission_rules (package_id, role, content_type, amount)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE amount = VALUES(amount)
        `, [package_id, role, type, amount]);

        res.json({ success: true, message: 'Commission rule saved' });
    } catch (e) {
        console.error('Save commission rule error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/commissions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM commission_rules WHERE id = ?', [id]);
        res.json({ success: true, message: 'Commission rule deleted' });
    } catch (e) {
        console.error('Delete commission rule error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Commission Report Endpoint
app.get('/api/reports/commissions', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date required' });
        }

        const query = `
            SELECT 
                u.name as user_name, 
                u.email as user_email, 
                oa.role as user_role,
                COUNT(DISTINCT oa.order_id) as order_count,
                SUM(oa.commission_amount) as total_commission
            FROM order_assignments oa
            JOIN users u ON oa.user_id = u.id
            JOIN orders o ON oa.order_id = o.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            GROUP BY u.id, oa.role
            ORDER BY total_commission DESC
        `;

        const [report] = await pool.query(query, [startDate, endDate]);
        res.json(report);
    } catch (e) {
        console.error('Commission report error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Order Assignments Endpoints
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get Order
        const [orders] = await pool.query(`
            SELECT o.*, p.name as package_name, p.price as package_price
            FROM orders o
            LEFT JOIN packages p ON o.package_id = p.id
            WHERE o.id = ?
        `, [id]);

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orders[0];

        // 2. Get Client
        let client = {};
        if (order.client_id) {
            const [clients] = await pool.query('SELECT * FROM clients WHERE id = ?', [order.client_id]);
            if (clients.length > 0) client = clients[0];
        }

        // 3. Get Details
        let details = {};
        const [d] = await pool.query('SELECT * FROM order_details WHERE order_id = ?', [id]);
        if (d.length > 0) details = d[0];

        // 4. Get Targets
        let targets = {};
        const [t] = await pool.query('SELECT * FROM order_targets WHERE order_id = ?', [id]);
        if (t.length > 0) targets = t[0];

        res.json({
            order,
            client,
            details,
            targets
        });

    } catch (e) {
        console.error('Order detail fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/orders/:id/assignments', async (req, res) => {
    try {
        const { id } = req.params;
        const [assignments] = await pool.query(
            `SELECT oa.*, u.name as user_name 
             FROM order_assignments oa 
             JOIN users u ON oa.user_id = u.id 
             WHERE oa.order_id = ?`,
            [id]
        );
        res.json(assignments);
    } catch (e) {
        console.error('Get assignments error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/assignments', async (req, res) => {
    try {
        const { id } = req.params; // orderId
        // Handle both camelCase and snake_case
        const { userId, role, contentType, user_id, content_type } = req.body;
        
        const finalUserId = userId || user_id;
        const finalContentType = contentType || content_type || 'general';

        if (!finalUserId || !role) {
            return res.status(400).json({ error: 'User ID and Role are required' });
        }

        // 1. Get Package ID to calculate commission
        const [orders] = await pool.query('SELECT package_id FROM orders WHERE id = ?', [id]);
        if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });
        const packageId = orders[0].package_id;

        // 2. Get Commission Rule
        let amount = 0;
        if (packageId) {
            const [rules] = await pool.query(
                'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                [packageId, role, finalContentType]
            );
            if (rules.length > 0) {
                amount = rules[0].amount;
            }
        }

        // 3. Upsert Assignment
        // Check if exists
        const [existing] = await pool.query(
            'SELECT id FROM order_assignments WHERE order_id = ? AND role = ? AND content_type = ?',
            [id, role, finalContentType]
        );

        if (existing.length > 0) {
            await pool.query(
                'UPDATE order_assignments SET user_id = ?, commission_amount = ? WHERE id = ?',
                [finalUserId, amount, existing[0].id]
            );
        } else {
            await pool.query(
                'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, ?, ?, ?)',
                [id, finalUserId, role, finalContentType, amount]
            );
        }

        res.json({ success: true, message: 'Assignment updated' });
    } catch (e) {
        console.error('Update assignment error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Order Content Endpoints
app.get('/api/orders/:id/content', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get Status
        const [contents] = await pool.query('SELECT status FROM order_contents WHERE order_id = ?', [id]);
        const status = contents.length > 0 ? contents[0].status : 'Baru';

        // Get Links
        const [links] = await pool.query('SELECT * FROM order_content_links WHERE order_id = ?', [id]);

        res.json({ status, links });
    } catch (e) {
        console.error('Get content error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/content/start', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Upsert status
        const [existing] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
        
        if (existing.length > 0) {
            await pool.query('UPDATE order_contents SET status = "Proses Konten" WHERE order_id = ?', [id]);
        } else {
            await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Proses Konten")', [id]);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Start content error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/content/submit', async (req, res) => {
    try {
        const { id } = req.params;
        const { links } = req.body; // Array of { url, description, type }

        // 1. Update Status
        const [existing] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
        if (existing.length > 0) {
            await pool.query('UPDATE order_contents SET status = "Siap Iklan" WHERE order_id = ?', [id]);
        } else {
            await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Siap Iklan")', [id]);
        }

        // 2. Save Links (Replace all)
        await pool.query('DELETE FROM order_content_links WHERE order_id = ?', [id]);
        
        if (links && links.length > 0) {
            const values = links.map(l => [id, l.url, l.type || 'image', l.description || '']);
            await pool.query(
                'INSERT INTO order_content_links (order_id, url, type, description) VALUES ?',
                [values]
            );
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Submit content error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start Server
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`Server running on http://${displayHost}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
