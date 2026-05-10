const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();
const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
// const cors = require('cors'); // Cors not installed in package.json

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files from root
app.use((req, res, next) => {
    if (req.path && String(req.path).startsWith('/api/')) {
        const origin = req.headers.origin ? String(req.headers.origin) : '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
});

// Database Connection
const DATABASE_URL = process.env.MYSQL_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('Missing MYSQL_URL/DATABASE_URL env. Make sure .env exists in app folder or PM2 env is set.');
    process.exit(1);
}
const pool = mysql.createPool(DATABASE_URL);

// Helper function for Scalev code compatibility
const getPool = () => pool;

// Helper function to ensure environment is ready (mock implementation)
function ensureEnv() {
    if (!process.env.MYSQL_URL && !process.env.DATABASE_URL) {
        throw new Error('MYSQL_URL/DATABASE_URL is missing');
    }
}

// --- Scalev Webhook Integration ---

async function ensureUsersPhoneColumn() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE users ADD COLUMN phone VARCHAR(30)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE users ADD INDEX idx_users_phone (phone)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_KEYNAME') throw e;
        }
        console.log('Users phone column ready');
    } catch (e) {
        console.error('Error ensuring users phone column:', e);
    }
}

async function ensurePackagesSchema() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE packages ADD COLUMN category VARCHAR(50)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE packages ADD COLUMN duration VARCHAR(50)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE packages ADD COLUMN price DECIMAL(15,2)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`UPDATE packages SET price = price_monthly WHERE price IS NULL AND price_monthly IS NOT NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_BAD_FIELD_ERROR') throw e;
        }
        console.log('Packages schema ready');
    } catch (e) {
        console.error('Error ensuring packages schema:', e);
    }
}

async function ensureOrdersExtraColumns() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN service_type VARCHAR(50)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN meta_data JSON`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code === 'ER_DUP_FIELDNAME') {
                // ignore
            } else {
                try {
                    await p.query(`ALTER TABLE orders ADD COLUMN meta_data LONGTEXT`);
                } catch (e2) {
                    const code2 = String((e2 && e2.code) || '');
                    if (code2 !== 'ER_DUP_FIELDNAME') throw e;
                }
            }
        }
        console.log('Orders extra columns ready');
    } catch (e) {
        console.error('Error ensuring orders extra columns:', e);
    }
}

async function ensureOrdersRenewalColumns() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN parent_order_id INT NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN renewal_count INT DEFAULT 0`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        console.log('Orders renewal columns ready');
    } catch (e) {
        console.error('Error ensuring orders renewal columns:', e);
    }
}

async function ensureOrdersTimingColumns() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN go_live_date DATE NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN start_date_source VARCHAR(30) DEFAULT 'system'`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        console.log('Orders timing columns ready');
    } catch (e) {
        console.error('Error ensuring orders timing columns:', e);
    }
}

function parseDurationDays(raw) {
    const s = String(raw || '').trim();
    if (!s) return 30;
    const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 30;
}

async function getOrderDurationDays(orderId) {
    const [rows] = await pool.query(
        `SELECT p.duration AS package_duration
         FROM orders o
         LEFT JOIN packages p ON p.id = o.package_id
         WHERE o.id = ? LIMIT 1`,
        [orderId]
    );
    if (!rows.length) return 30;
    return parseDurationDays(rows[0].package_duration);
}

async function applyActualGoLiveDate(orderId, liveDate, durationDays) {
    await ensureOrdersTimingColumns();
    const d = String(liveDate || '').trim();
    if (!d) return;
    const days = Number.isFinite(Number(durationDays)) && Number(durationDays) > 0 ? Number(durationDays) : 30;
    await pool.query(
        `UPDATE orders
         SET go_live_date = ?,
             start_date = ?,
             end_date = DATE_ADD(?, INTERVAL ? DAY),
             start_date_source = 'advertiser_actual'
         WHERE id = ?
           AND (go_live_date IS NULL OR start_date_source IS NULL OR start_date_source IN ('cs_estimate', 'system', ''))`,
        [d, d, d, days, orderId]
    );
}

async function ensureCommissionLedgerSchema() {
    try {
        const p = await getPool();
        const tryAdd = async (sql) => {
            try {
                await p.query(sql);
            } catch (e) {
                const code = String((e && e.code) || '');
                if (code === 'ER_DUP_FIELDNAME') return;
                if (code === 'ER_NO_SUCH_TABLE') return;
                throw e;
            }
        };

        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN content_type VARCHAR(50)`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN basis_amount DECIMAL(15,2) NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN rate_type VARCHAR(20) NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN rate_value DECIMAL(15,4) NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN source_event VARCHAR(60) NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN ref_txn_id INT NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN posted_at DATETIME NULL`);

        console.log('Commission ledger schema ready');
    } catch (e) {
        console.error('Error ensuring commission ledger schema:', e);
    }
}

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
                UNIQUE KEY uniq_scalev_order_id (scalev_order_id),
                INDEX (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 
        `);
        try {
            await p.query(`ALTER TABLE scalev_orders ADD UNIQUE KEY uniq_scalev_order_id (scalev_order_id)`);
        } catch (e) {
            const code = String(e && e.code || '');
            if (code !== 'ER_DUP_KEYNAME' && code !== 'ER_DUP_ENTRY') throw e;
        }
        console.log('Scalev orders table ready');
    } catch (e) {
        console.error('Error creating scalev table:', e);
    }
}

async function createScalevWebhookEventsTable() {
    try {
        const p = await getPool();
        await p.query(`
            CREATE TABLE IF NOT EXISTS scalev_webhook_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                unique_id VARCHAR(100) NOT NULL,
                event VARCHAR(100) NOT NULL,
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_unique_id (unique_id),
                INDEX (event),
                INDEX (received_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Scalev webhook events table ready');
    } catch (e) {
        console.error('Error creating scalev webhook events table:', e);
    }
}

async function createScalevLeadsTable() {
    try {
        const p = await getPool();
        await p.query(`
            CREATE TABLE IF NOT EXISTS scalev_leads (
                id INT AUTO_INCREMENT PRIMARY KEY,
                scalev_lead_id VARCHAR(120),
                name VARCHAR(191),
                phone VARCHAR(50),
                email VARCHAR(191),
                status VARCHAR(80),
                source VARCHAR(120),
                campaign VARCHAR(191),
                notes TEXT,
                business_username VARCHAR(191),
                business_client_id VARCHAR(191),
                handler_email VARCHAR(191),
                advertiser VARCHAR(191),
                order_link TEXT,
                event_source_url TEXT,
                raw_data LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_scalev_lead_id (scalev_lead_id),
                INDEX (phone),
                INDEX (email),
                INDEX (status),
                INDEX (handler_email),
                INDEX (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        try {
            await p.query(`ALTER TABLE scalev_leads ADD COLUMN notes TEXT`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE scalev_leads ADD COLUMN business_username VARCHAR(191)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE scalev_leads ADD COLUMN business_client_id VARCHAR(191)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE scalev_leads ADD COLUMN handler_email VARCHAR(191)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE scalev_leads ADD COLUMN advertiser VARCHAR(191)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE scalev_leads ADD COLUMN order_link TEXT`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE scalev_leads ADD COLUMN event_source_url TEXT`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE scalev_leads ADD INDEX idx_scalev_leads_handler_email (handler_email)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_KEYNAME') throw e;
        }
        console.log('Scalev leads table ready');
    } catch (e) {
        console.error('Error creating scalev leads table:', e);
    }
}

function getScalevSigningSecret() {
    const secret = process.env.SCALEV_SIGNING_SECRET || process.env.SCALEV_WEBHOOK_SIGNING_SECRET;
    if (!secret) return null;
    return String(secret);
}

function calculateScalevHmacBase64(rawBodyBuffer, signingSecret) {
    return crypto.createHmac('sha256', signingSecret).update(rawBodyBuffer).digest('base64');
}

function getScalevLeadKey(payload, rawBody) {
    const data = payload && payload.data ? payload.data : {};
    const direct =
        data.lead_id ||
        data.leadId ||
        data.id ||
        data.uuid ||
        data.uid ||
        (payload ? payload.lead_id : null) ||
        (payload ? payload.leadId : null) ||
        (payload ? payload.id : null);
    if (direct) return String(direct);

    if (payload && payload.unique_id) return `event_${String(payload.unique_id)}`;

    if (rawBody && Buffer.isBuffer(rawBody) && rawBody.length) {
        return `body_${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
    }

    return `unknown_${crypto.randomBytes(16).toString('hex')}`;
}

function safeEqual(a, b) {
    const ba = Buffer.from(String(a || ''), 'utf8');
    const bb = Buffer.from(String(b || ''), 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

async function verifyScalevWebhook(req) {
    const signature = String(req.headers['x-scalev-hmac-sha256'] || '').trim();
    const signingSecret = getScalevSigningSecret();
    if (!signingSecret) return { ok: false, reason: 'missing_signing_secret' };
    if (!signature) return { ok: false, reason: 'missing_signature' };
    if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) return { ok: false, reason: 'missing_raw_body' };
    const calculated = calculateScalevHmacBase64(req.rawBody, signingSecret);
    if (!safeEqual(signature, calculated)) return { ok: false, reason: 'invalid_signature' };
    return { ok: true };
}

ensureUsersPhoneColumn();
ensurePackagesSchema();
ensureOrdersExtraColumns();
ensureOrdersRenewalColumns();
ensureOrdersTimingColumns();
ensureCommissionLedgerSchema();
createScalevTable();
createScalevWebhookEventsTable();
createScalevLeadsTable();

app.post('/api/webhooks/scalev', async (req, res) => {
    ensureEnv();
    try {
        const verified = await verifyScalevWebhook(req);
        if (!verified.ok) {
            return res.status(401).json({ error: 'Unauthorized', reason: verified.reason });
        }

        const payload = req.body;
        console.log('Scalev webhook received:', String(payload && payload.event || 'unknown'));

        const p = await getPool();
        const uniqueId = payload && payload.unique_id ? String(payload.unique_id) : '';
        if (uniqueId) {
            try {
                await p.query(
                    `INSERT INTO scalev_webhook_events (unique_id, event) VALUES (?, ?)`,
                    [uniqueId, String(payload.event || 'unknown')]
                );
            } catch (e) {
                if (String(e && e.code) === 'ER_DUP_ENTRY') {
                    return res.status(200).json({ received: true, duplicate: true });
                }
                throw e;
            }
        }
        
        // 1. Handle Test Event
        if (payload.event === 'business.test_event') {
            console.log('Scalev Test Event Received');
            return res.status(200).json({ message: 'OK' });
        }

        // 2. Handle Order Created
        if (
            payload.event === 'order.created' ||
            payload.event === 'order.updated' ||
            payload.event === 'order.epayment_created' ||
            payload.event === 'order.spam_created'
        ) {
            const data = payload.data;
            const mv = (data && data.message_variables) || payload.message_variables || {};
            
            // Extract relevant fields
            const orderId = data.order_id;
            const invoice = data.invoice_number || orderId; // Fallback
            const customerName = data.destination_address?.name || mv.name || 'Unknown';
            const customerPhone = data.destination_address?.phone || mv.phone || '';
            const customerEmail = data.destination_address?.email || mv.email || '';
            const total = data.net_revenue || data.gross_revenue || 0;
            const status = data.status || 'pending';
            const items = JSON.stringify(data.orderlines || []);
            const paymentMethod = data.payment_method || '';
            const paymentStatus = data.payment_status || 'unpaid';

            const rawData = JSON.stringify(payload);
            const [upd] = await p.query(
                `UPDATE scalev_orders
                 SET invoice_number = ?,
                     customer_name = ?,
                     customer_phone = ?,
                     customer_email = ?,
                     payment_method = ?,
                     payment_status = ?,
                     total_amount = ?,
                     items = ?,
                     status = ?,
                     raw_data = ?
                 WHERE scalev_order_id = ?`,
                [
                    invoice, customerName, customerPhone, customerEmail,
                    paymentMethod, paymentStatus, total, items, status, rawData,
                    orderId
                ]
            );
            if (!upd || !upd.affectedRows) {
                await p.query(
                    `INSERT INTO scalev_orders
                     (scalev_order_id, invoice_number, customer_name, customer_phone, customer_email,
                      payment_method, payment_status, total_amount, items, status, raw_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId, invoice, customerName, customerPhone, customerEmail,
                        paymentMethod, paymentStatus, total, items, status, rawData
                    ]
                );
            }

            const leadKey =
                (data.customer_id ? `customer_${String(data.customer_id)}` : null) ||
                (customerPhone ? `phone_${String(customerPhone)}` : null) ||
                (customerEmail ? `email_${String(customerEmail)}` : null) ||
                `order_${String(orderId)}`;
            const leadStatus = status;
            const leadSource =
                (data.store && data.store.name ? String(data.store.name) : '') ||
                (data.business && data.business.username ? String(data.business.username) : '') ||
                '';
            const leadNotes =
                (data && data.notes ? String(data.notes) : '') ||
                (data.destination_address && data.destination_address.notes ? String(data.destination_address.notes) : '') ||
                (mv && mv.notes ? String(mv.notes) : '') ||
                '';
            const leadBusinessUsername = data.business && data.business.username ? String(data.business.username) : '';
            const leadBusinessClientId = data.business && data.business.client_id ? String(data.business.client_id) : '';
            const handlerEmail = mv && mv.handler ? String(mv.handler).trim().toLowerCase() : '';
            const advertiser = mv && mv.advertiser ? String(mv.advertiser).trim() : '';
            const orderLink = mv && mv.order_link ? String(mv.order_link).trim() : '';
            const eventSourceUrl =
                (mv && mv.event_source_url ? String(mv.event_source_url).trim() : '') ||
                (data.metadata && data.metadata.event_source_url ? String(data.metadata.event_source_url).trim() : '') ||
                '';
            const [leadUpd] = await p.query(
                `UPDATE scalev_leads
                 SET name = ?,
                     phone = ?,
                     email = ?,
                     status = ?,
                     source = ?,
                     campaign = ?,
                     notes = ?,
                     business_username = ?,
                     business_client_id = ?,
                     handler_email = ?,
                     advertiser = ?,
                     order_link = ?,
                     event_source_url = ?,
                     raw_data = ?
                 WHERE scalev_lead_id = ?`,
                [customerName, customerPhone, customerEmail, leadStatus, leadSource, '', leadNotes, leadBusinessUsername, leadBusinessClientId, handlerEmail, advertiser, orderLink, eventSourceUrl, rawData, leadKey]
            );
            if (!leadUpd || !leadUpd.affectedRows) {
                await p.query(
                    `INSERT INTO scalev_leads
                     (scalev_lead_id, name, phone, email, status, source, campaign, notes, business_username, business_client_id, handler_email, advertiser, order_link, event_source_url, raw_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [leadKey, customerName, customerPhone, customerEmail, leadStatus, leadSource, '', leadNotes, leadBusinessUsername, leadBusinessClientId, handlerEmail, advertiser, orderLink, eventSourceUrl, rawData]
                );
            }
            
            console.log(`Scalev Order Upserted: ${orderId}`);
            return res.status(200).json({ success: true });
        }

        if (String(payload.event || '').startsWith('lead.')) {
            const data = payload.data || {};
            const leadKey = getScalevLeadKey(payload, req.rawBody);
            const mv = (data && data.message_variables) || payload.message_variables || {};

            const name =
                data.name ||
                data.full_name ||
                data.fullName ||
                data.customer_name ||
                (data.contact ? data.contact.name : null) ||
                (data.customer ? data.customer.name : null) ||
                mv.name ||
                '';
            const phone =
                data.phone ||
                data.whatsapp ||
                data.mobile ||
                (data.contact ? (data.contact.phone || data.contact.whatsapp) : null) ||
                (data.customer ? (data.customer.phone || data.customer.whatsapp) : null) ||
                mv.phone ||
                '';
            const email =
                data.email ||
                (data.contact ? data.contact.email : null) ||
                (data.customer ? data.customer.email : null) ||
                mv.email ||
                '';
            const status = data.status || data.lead_status || data.stage || '';
            const source = data.source || data.channel || data.platform || '';
            const campaign = data.campaign || data.campaign_name || data.ad_name || data.form_name || '';
            const notes =
                data.notes ||
                data.note ||
                data.message ||
                (data.destination_address ? data.destination_address.notes : null) ||
                mv.notes ||
                '';
            const businessUsername =
                (data.business && data.business.username ? String(data.business.username) : '') ||
                (payload.data && payload.data.business && payload.data.business.username ? String(payload.data.business.username) : '') ||
                '';
            const businessClientId =
                (data.business && data.business.client_id ? String(data.business.client_id) : '') ||
                (payload.data && payload.data.business && payload.data.business.client_id ? String(payload.data.business.client_id) : '') ||
                '';
            const handlerEmail = mv && mv.handler ? String(mv.handler).trim().toLowerCase() : '';
            const advertiser = mv && mv.advertiser ? String(mv.advertiser).trim() : '';
            const orderLink = mv && mv.order_link ? String(mv.order_link).trim() : '';
            const eventSourceUrl =
                (mv && mv.event_source_url ? String(mv.event_source_url).trim() : '') ||
                (data.metadata && data.metadata.event_source_url ? String(data.metadata.event_source_url).trim() : '') ||
                '';

            const rawData = JSON.stringify(payload);
            const [upd] = await p.query(
                `UPDATE scalev_leads
                 SET name = ?,
                     phone = ?,
                     email = ?,
                     status = ?,
                     source = ?,
                     campaign = ?,
                     notes = ?,
                     business_username = ?,
                     business_client_id = ?,
                     handler_email = ?,
                     advertiser = ?,
                     order_link = ?,
                     event_source_url = ?,
                     raw_data = ?
                 WHERE scalev_lead_id = ?`,
                [name, phone, email, status, source, campaign, String(notes || ''), businessUsername, businessClientId, handlerEmail, advertiser, orderLink, eventSourceUrl, rawData, leadKey]
            );
            if (!upd || !upd.affectedRows) {
                await p.query(
                    `INSERT INTO scalev_leads
                     (scalev_lead_id, name, phone, email, status, source, campaign, notes, business_username, business_client_id, handler_email, advertiser, order_link, event_source_url, raw_data)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [leadKey, name, phone, email, status, source, campaign, String(notes || ''), businessUsername, businessClientId, handlerEmail, advertiser, orderLink, eventSourceUrl, rawData]
                );
            }
            return res.status(200).json({ success: true });
        }

        if (payload.event === 'order.status_changed') {
            const data = payload.data || {};
            const orderId = data.order_id;
            const status = data.status || '';
            if (orderId) {
                await p.query(
                    `UPDATE scalev_orders SET status = ?, raw_data = ? WHERE scalev_order_id = ?`,
                    [status, JSON.stringify(payload), orderId]
                );
            }
            return res.status(200).json({ success: true });
        }

        if (payload.event === 'order.payment_status_changed') {
            const data = payload.data || {};
            const orderId = data.order_id;
            const paymentStatus = data.payment_status || '';
            const paymentMethod = data.payment_method || '';
            if (orderId) {
                await p.query(
                    `UPDATE scalev_orders SET payment_status = ?, payment_method = ?, raw_data = ? WHERE scalev_order_id = ?`,
                    [paymentStatus, paymentMethod, JSON.stringify(payload), orderId]
                );
            }
            return res.status(200).json({ success: true });
        }

        if (payload.event === 'order.deleted') {
            const data = payload.data || {};
            const orderId = data.order_id;
            if (orderId) {
                await p.query(
                    `UPDATE scalev_orders SET status = 'deleted', raw_data = ? WHERE scalev_order_id = ?`,
                    [JSON.stringify(payload), orderId]
                );
            }
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
        const limit = parseInt(req.query.limit) || 5;
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

app.get('/api/scalev/leads', async (req, res) => {
    ensureEnv();
    try {
        const p = await getPool();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;

        const role = String(req.query.role || '').toLowerCase();
        const userId = parseInt(req.query.user_id || '0');

        let whereSql = '';
        let whereParams = [];

        if (role === 'cs' && userId) {
            const [urows] = await p.query(`SELECT email FROM users WHERE id = ? LIMIT 1`, [userId]);
            const email = urows && urows[0] && urows[0].email ? String(urows[0].email).trim().toLowerCase() : '';
            if (!email) {
                return res.json({ data: [], meta: { page, limit, total: 0, totalPages: 0 } });
            }
            whereSql = `WHERE LOWER(handler_email) = ?`;
            whereParams = [email];
        }

        const [rows] = await p.query(
            `
            SELECT SQL_CALC_FOUND_ROWS *
            FROM scalev_leads
            ${whereSql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            `,
            [...whereParams, limit, offset]
        );

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

        const identifier = String(email || '').trim();
        const identifierPhone = identifier.replace(/[^0-9]/g, '');
        const phoneCandidates = [];
        if (identifierPhone) {
            phoneCandidates.push(identifierPhone);
            if (identifierPhone.startsWith('0')) phoneCandidates.push('62' + identifierPhone.slice(1));
        }

        let sql = `
            SELECT *
            FROM users
            WHERE LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?)
        `;
        const params = [identifier, identifier];
        for (const p of phoneCandidates) {
            sql += ` OR phone = ?`;
            params.push(p);
        }
        sql += ` ORDER BY id ASC LIMIT 1`;

        const [users] = await pool.query(sql, params);
        
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

// CS Dashboard Stats (my clients and commissions)
app.get('/api/dashboard/cs-stats', async (req, res) => {
    try {
        const userId = parseInt(req.query.user_id || '0');
        if (!userId) return res.status(400).json({ error: 'user_id required' });
        const [totalClients] = await pool.query(`
            SELECT COUNT(DISTINCT o.client_id) as count
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id
            WHERE oa.user_id = ? AND oa.role = 'CS'
        `, [userId]);
        const [newClients] = await pool.query(`
            SELECT COUNT(DISTINCT o.client_id) as count
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id
            WHERE oa.user_id = ? AND oa.role = 'CS'
              AND LOWER(o.status) IN ('baru','new')
              AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        const [extendClients] = await pool.query(`
            SELECT COUNT(DISTINCT o.client_id) as count
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id
            WHERE oa.user_id = ? AND oa.role = 'CS'
              AND LOWER(o.status) IN ('perpanjang','extend','repeat')
              AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        const [commission] = await pool.query(`
            SELECT COALESCE(SUM(oa.commission_amount), 0) as total
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            WHERE oa.user_id = ? AND oa.role = 'CS'
              AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        res.json({
            totalClients: totalClients[0].count || 0,
            newClientsThisMonth: newClients[0].count || 0,
            extendClientsThisMonth: extendClients[0].count || 0,
            commissionThisMonth: commission[0].total || 0
        });
    } catch (e) {
        console.error('CS stats error:', e);
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
            const [ordersCount] = await pool.query(`
                SELECT COUNT(*) as count 
                FROM orders 
                WHERE status NOT IN ('cancelled','completed')
                  AND MONTH(created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(created_at) = YEAR(CURRENT_DATE())
            `);
            const [clientsTotal] = await pool.query(`SELECT COUNT(*) as count FROM clients`);
            // New clients: distinct clients that have orders with status 'Baru' this month
            const [newClients] = await pool.query(`
                SELECT COUNT(DISTINCT o.client_id) as count
                FROM orders o
                WHERE o.status = 'Baru'
                  AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
            `);
            // Extend orders count: status 'Perpanjang' this month
            const [extendOrders] = await pool.query(`
                SELECT COUNT(*) as count
                FROM orders o
                WHERE o.status = 'Perpanjang'
                  AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
            `);
            // Omset (Revenue) dari pembayaran klien bulan ini (transactions.type='income')
            const [rev] = await pool.query(`
                SELECT SUM(t.amount) as total
                FROM transactions t
                WHERE t.type = 'income'
                  AND MONTH(t.created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(t.created_at) = YEAR(CURRENT_DATE())
            `);
            // Komisi dibayar bulan ini (transactions.type in commission variants)
            const [commPaid] = await pool.query(`
                SELECT SUM(t.amount) as total
                FROM transactions t
                WHERE t.type IN ('commission','commission_pay')
                  AND MONTH(t.created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(t.created_at) = YEAR(CURRENT_DATE())
            `);
            // Ads spending this month: transactions type 'expense' in current month
            const [spend] = await pool.query(`
                SELECT SUM(t.amount) as total
                FROM transactions t
                WHERE t.type = 'expense'
                  AND MONTH(t.created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(t.created_at) = YEAR(CURRENT_DATE())
            `);

            stats.activeOrders = ordersCount[0].count;
            stats.totalClients = clientsTotal[0].count || 0;
            stats.newClientsThisMonth = newClients[0].count || 0;
            stats.extendOrdersThisMonth = extendOrders[0].count || 0;
            stats.revenueThisMonth = rev[0].total || 0;
            stats.commissionsThisMonth = commPaid[0].total || 0;
            stats.adsSpendThisMonth = spend[0].total || 0;
            stats.activeCampaigns = 0; // TODO: compute from campaigns table if available
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
             
             // Content created this month: from commission_ledger 'content_ready'
             const [completed] = await pool.query(`
                SELECT COUNT(*) as count
                FROM commission_ledger cl
                WHERE cl.user_id = ? AND cl.role = 'Editor' AND cl.source_event = 'content_ready'
                  AND MONTH(cl.created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(cl.created_at) = YEAR(CURRENT_DATE())
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

// CRM Dashboard Stats
app.get('/api/dashboard/crm-stats', async (req, res) => {
    try {
        const userId = parseInt(req.query.user_id || '0');
        if (!userId) return res.status(400).json({ error: 'user_id required' });
        const [otpCount] = await pool.query(`
            SELECT COUNT(*) as count
            FROM commission_ledger
            WHERE user_id = ? AND role = 'CRM' AND source_event = 'otp_sent'
              AND MONTH(created_at) = MONTH(CURRENT_DATE())
              AND YEAR(created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        const [commPaid] = await pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM commission_ledger
            WHERE user_id = ? AND role = 'CRM' AND status = 'paid'
              AND MONTH(posted_at) = MONTH(CURRENT_DATE())
              AND YEAR(posted_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        // New clients handled by CRM this month
        const [newClients] = await pool.query(`
            SELECT COUNT(DISTINCT o.client_id) as count
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id
            WHERE oa.user_id = ? AND oa.role = 'CRM'
              AND LOWER(o.status) IN ('baru','new')
              AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        // Extend clients handled by CRM this month
        const [extendClients] = await pool.query(`
            SELECT COUNT(DISTINCT o.client_id) as count
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id
            WHERE oa.user_id = ? AND oa.role = 'CRM'
              AND LOWER(o.status) IN ('perpanjang','extend','repeat')
              AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        res.json({
            otpThisMonth: otpCount[0].count || 0,
            commissionThisMonth: commPaid[0].total || 0,
            newClientsThisMonth: newClients[0].count || 0,
            extendClientsThisMonth: extendClients[0].count || 0
        });
    } catch (e) {
        console.error('CRM stats error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Users Endpoint
app.get('/api/users', async (req, res) => {
    try {
        const qRole = (req.query.role || '').toString().trim().toLowerCase();
        let sql = 'SELECT id, name, email, phone, role, created_at FROM users';
        let params = [];
        if (qRole) {
            const map = {
                'cs': 'CS',
                'advertiser': 'Advertiser',
                'editor': 'Editor',
                'crm': 'CRM',
                'team bengkel': 'Team Bengkel',
                'bengkel': 'Team Bengkel',
                'super_admin': 'super_admin',
                'keuangan': 'Keuangan'
            };
            const roleValue = map[qRole] || qRole;
            sql += ' WHERE LOWER(role) = LOWER(?)';
            params.push(roleValue);
        }
        try {
            const [users] = await pool.query(sql, params);
            return res.json(users);
        } catch (e) {
            if (String(e && e.code) === 'ER_BAD_FIELD_ERROR') {
                const fallbackSql = sql.replace(', phone', '');
                const [users] = await pool.query(fallbackSql, params);
                return res.json(users);
            }
            throw e;
        }
    } catch (e) {
        console.error('Users fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Finance: Accrual History
app.get('/api/finance/accrual-history', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let s = startDate, e = endDate;
        if (!s || !e) {
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
            s = first; e = last;
        }
        const [rows] = await pool.query(`
            SELECT cl.id, cl.order_id, cl.user_id, u.name as user_name, u.role as user_role,
                   cl.role, cl.content_type, cl.amount, cl.status, cl.source_event,
                   cl.created_at, cl.posted_at,
                   o.status as order_status, c.name as client_name, p.name as package_name
            FROM commission_ledger cl
            LEFT JOIN users u ON cl.user_id = u.id
            LEFT JOIN orders o ON cl.order_id = o.id
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
            WHERE DATE(cl.created_at) BETWEEN ? AND ?
            ORDER BY cl.created_at DESC
            LIMIT 200
        `, [s, e]);
        res.json(rows);
    } catch (e) {
        console.error('Finance accrual history error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/users', async (req, res) => {
    try {
        const { name, email, role, password, phone } = req.body || {};
        if (!name || !email || !role) {
            return res.status(400).json({ error: 'Name, email, and role are required' });
        }
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already exists' });
        }
        await ensureUsersPhoneColumn();
        const normalizedPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
        let result;
        try {
            [result] = await pool.query(
                'INSERT INTO users (name, email, phone, role, password_hash) VALUES (?, ?, ?, ?, ?)',
                [name, email, normalizedPhone, role, password || '']
            );
        } catch (e) {
            if (String(e && e.code) === 'ER_BAD_FIELD_ERROR') {
                [result] = await pool.query(
                    'INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)',
                    [name, email, role, password || '']
                );
            } else {
                throw e;
            }
        }
        res.json({ success: true, id: result.insertId });
    } catch (e) {
        console.error('User create error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, password, phone } = req.body || {};
        if (!name || !email || !role) {
            return res.status(400).json({ error: 'Name, email, and role are required' });
        }
        await ensureUsersPhoneColumn();
        const normalizedPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
        try {
            await pool.query(
                'UPDATE users SET name = ?, email = ?, phone = ?, role = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?',
                [name, email, normalizedPhone, role, password || null, id]
            );
        } catch (e) {
            if (String(e && e.code) === 'ER_BAD_FIELD_ERROR') {
                await pool.query(
                    'UPDATE users SET name = ?, email = ?, role = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?',
                    [name, email, role, password || null, id]
                );
            } else {
                throw e;
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error('User update error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('User delete error:', e);
        const code = String((e && e.code) || '');
        if (code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({
                error: 'User masih dipakai di data lain (mis. order_assignments). Hapus/ubah assignment dulu sebelum delete user.'
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Clients Endpoint
app.get('/api/clients', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const q = req.query.q || '';
        const assigned_to = req.query.assigned_to || '';
        const role = req.query.role || '';

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

                // Filter by assignment (e.g., CS)
                if (assigned_to && role) {
                    // Ensure WHERE exists
                    query += (query.toLowerCase().includes(' where ') ? ' AND ' : ' WHERE ');
                    query += `
                        EXISTS (
                            SELECT 1
                            FROM orders o2
                            JOIN order_assignments oa2 ON o2.id = oa2.order_id
                            WHERE o2.client_id = c.id
                              AND oa2.user_id = ?
                              AND oa2.role = ?
                        )
                    `;
                    params.push(assigned_to, role);
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

        if (assigned_to && role) {
            countQuery += (countQuery.toLowerCase().includes(' where ') ? ' AND ' : ' WHERE ');
            countQuery += `
                EXISTS (
                    SELECT 1
                    FROM orders o2
                    JOIN order_assignments oa2 ON o2.id = oa2.order_id
                    WHERE o2.client_id = c.id
                      AND oa2.user_id = ?
                      AND oa2.role = ?
                )
            `;
            countParams.push(assigned_to, role);
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

app.put('/api/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, businessName, businessType, whatsapp, address } = req.body || {};
        if (!name || !businessName) {
            return res.status(400).json({ error: 'Name and Business Name are required' });
        }
        await pool.query(
            'UPDATE clients SET name = ?, business_name = ?, business_type = ?, whatsapp = ?, address = ? WHERE id = ?',
            [name, businessName || null, businessType || null, whatsapp || null, address || null, id]
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Update client error:', e);
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

app.post('/api/packages', async (req, res) => {
    try {
        const { category, code, name, duration, price, description, active } = req.body || {};
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name required' });
        }
        await ensurePackagesSchema();
        let result;
        try {
            [result] = await pool.query(
                'INSERT INTO packages (code, name, duration, price, description, active, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [code, name, duration || null, price || null, description || null, active ? 1 : 0, category || null]
            );
        } catch (e) {
            if (String(e && e.code) === 'ER_BAD_FIELD_ERROR') {
                [result] = await pool.query(
                    'INSERT INTO packages (code, name, price_monthly, description, active) VALUES (?, ?, ?, ?, ?)',
                    [code, name, price || null, description || null, active ? 1 : 0]
                );
            } else {
                throw e;
            }
        }
        res.json({ success: true, id: result.insertId });
    } catch (e) {
        console.error('Package create error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/packages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { category, code, name, duration, price, description, active } = req.body || {};
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name required' });
        }
        await ensurePackagesSchema();
        try {
            await pool.query(
                'UPDATE packages SET code = ?, name = ?, duration = ?, price = ?, description = ?, active = ?, category = ? WHERE id = ?',
                [code, name, duration || null, price || null, description || null, active ? 1 : 0, category || null, id]
            );
        } catch (e) {
            if (String(e && e.code) === 'ER_BAD_FIELD_ERROR') {
                await pool.query(
                    'UPDATE packages SET code = ?, name = ?, price_monthly = ?, description = ?, active = ? WHERE id = ?',
                    [code, name, price || null, description || null, active ? 1 : 0, id]
                );
            } else {
                throw e;
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Package update error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/packages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM packages WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Package delete error:', e);
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

        const [cfg] = await pool.query("SELECT access_token FROM meta_ads_configs WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
        const token = cfg.length > 0 ? cfg[0].access_token : null;
        if (!token) {
            return res.status(400).json({ error: 'Access token is not configured' });
        }

        const acct = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`;
        const requestedObjective = (req.body && req.body.objective || '').toUpperCase();
        const allowedObjectives = new Set([
            'APP_INSTALLS','BRAND_AWARENESS','EVENT_RESPONSES','LEAD_GENERATION','LINK_CLICKS','LOCAL_AWARENESS','MESSAGES',
            'OFFER_CLAIMS','PAGE_LIKES','POST_ENGAGEMENT','PRODUCT_CATALOG_SALES','REACH','STORE_VISITS','VIDEO_VIEWS',
            'OUTCOME_AWARENESS','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_SALES','OUTCOME_TRAFFIC','OUTCOME_APP_PROMOTION','CONVERSIONS'
        ]);
        const finalObjective = allowedObjectives.has(requestedObjective) ? requestedObjective : 'MESSAGES';

        const params = new URLSearchParams({
            name,
            objective: finalObjective,
            status: 'PAUSED',
            access_token: token
        });
        const url = `https://graph.facebook.com/v19.0/${acct}/campaigns`;
        const resp = await fetch(url, { method: 'POST', body: params });
        const data = await resp.json();
        if (!resp.ok || !data || !data.id) {
            return res.status(502).json({ error: data?.error?.message || 'Failed to create campaign on Meta' });
        }

        const campaignId = data.id;
        await pool.query(
            `INSERT INTO campaigns (order_id, client_id, campaign_id, campaign_name, ad_account_id, status, impressions, clicks, ctr, spend, results, created_at, updated_at, result_type)
             VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, 0, 0, 0, 0, NOW(), NOW(), 'Results')`,
            [order_id || null, client_id || null, campaignId, name, ad_account_id]
        );
        // Update content process to "Proses Iklan"
        if (order_id) {
            const [existC] = await pool.query('SELECT id FROM order_contents WHERE order_id = ? LIMIT 1', [order_id]);
            if (existC.length > 0) {
                await pool.query('UPDATE order_contents SET status = "Proses Iklan" WHERE order_id = ?', [order_id]);
            } else {
                await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Proses Iklan")', [order_id]);
            }
            try {
                const durationDays = Number(duration) > 0 ? Number(duration) : await getOrderDurationDays(order_id);
                const liveDate = new Date().toISOString().split('T')[0];
                await applyActualGoLiveDate(order_id, liveDate, durationDays);
            } catch (e) {
                console.error('Apply go_live_date on campaign create error:', e);
            }
        }
        // Accrue advertiser commission and record finance
        try {
            const advUserIdRaw = req.body && (req.body.user_id || req.body.userId);
            const advRole = String((req.body && req.body.user_role) || '').toLowerCase();
            const advUserId = advUserIdRaw ? parseInt(advUserIdRaw) : null;
            if (advUserId && advRole === 'advertiser' && order_id) {
                let amount = 0;
                const [ord] = await pool.query('SELECT package_id FROM orders WHERE id = ? LIMIT 1', [order_id]);
                const pkgId = ord.length > 0 ? ord[0].package_id : null;
                if (pkgId) {
                    try {
                        const [rs] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'Advertiser', 'campaign']);
                        if (rs.length > 0 && rs[0].amount != null) amount = Number(rs[0].amount);
                        else {
                            const [rg] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'Advertiser', 'general']);
                            if (rg.length > 0 && rg[0].amount != null) amount = Number(rg[0].amount);
                        }
                    } catch (_) {
                        const [r2] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [pkgId, 'Advertiser']);
                        if (r2.length > 0 && r2[0].amount != null) amount = Number(r2[0].amount);
                    }
                }
                await pool.query(
                    `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                     VALUES (?, ?, 'Advertiser', 'campaign', ?)
                     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)`,
                    [order_id, advUserId, amount]
                );
                const [dup] = await pool.query(
                    'SELECT id FROM commission_ledger WHERE order_id = ? AND user_id = ? AND role = "Advertiser" AND source_event = "campaign_created" LIMIT 1',
                    [order_id, advUserId]
                );
                if (dup.length === 0) {
                    const [ledgerRes] = await pool.query(
                        'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, "Advertiser", "campaign", NULL, "flat", ?, ?, "accrued", "campaign_created")',
                        [order_id, advUserId, amount, amount]
                    );
                    const [txnRes] = await pool.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [order_id, amount]);
                    await pool.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnRes.insertId, ledgerRes.insertId]);
                }
            }
        } catch (e) {
            console.error('Advertiser commission on campaign create error:', e);
        }

        res.json({ success: true, campaign_id: campaignId, created_on_meta: true });
    } catch (e) {
        console.error('Campaign create error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Duplicate campaign flow aligned with Apps Script duplicateCampaignFullManual
app.post('/api/campaigns/duplicate', async (req, res) => {
    try {
        const {
            addAccountName,
            namaUsaha,
            addAccountId,
            pageId,
            campaignName,
            durasi,
            client_id,
            order_id
        } = req.body || {};

        if (!addAccountName || !addAccountId || !pageId || !campaignName || !durasi) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [cfg] = await pool.query("SELECT access_token FROM meta_ads_configs WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
        const token = cfg.length > 0 ? cfg[0].access_token : null;
        if (!token) {
            return res.status(400).json({ error: 'Access token is not configured' });
        }

        const MASTER_CAMPAIGNS = {
            R10: "120225943524550694",
            R11: "120227433380380200",
            R06: "120226449010810235",
            R04: "120227436872890554"
        };

        const baseCampaignId = MASTER_CAMPAIGNS[addAccountName];
        if (!baseCampaignId) {
            return res.status(400).json({ error: 'Unknown addAccountName mapping' });
        }

        // 1) Copy campaign
        const copyUrl = `https://graph.facebook.com/v21.0/${baseCampaignId}/copies`;
        const copyParams = new URLSearchParams({
            access_token: token,
            status: 'ACTIVE',
            deep_copy: 'false'
        });
        const copyResp = await fetch(copyUrl, { method: 'POST', body: copyParams });
        const copyData = await copyResp.json();
        const newCampaignId = copyData && copyData.copied_campaign_id;
        if (!copyResp.ok || !newCampaignId) {
            return res.status(502).json({ error: copyData?.error?.message || 'Failed to copy campaign', details: copyData?.error || copyData });
        }

        // 2) Rename campaign
        const renameUrl = `https://graph.facebook.com/v21.0/${newCampaignId}`;
        const renameParams = new URLSearchParams({
            access_token: token,
            name: campaignName
        });
        const renameResp = await fetch(renameUrl, { method: 'POST', body: renameParams });
        const renameData = await renameResp.json();
        if (!renameResp.ok || !(renameData && renameData.success)) {
            return res.status(502).json({ error: renameData?.error?.message || 'Failed to rename campaign', details: renameData?.error || renameData });
        }

        // 3) Get adsets of master campaign
        const adsetsUrl = `https://graph.facebook.com/v21.0/${baseCampaignId}/adsets?fields=id&access_token=${encodeURIComponent(token)}`;
        const adsetsResp = await fetch(adsetsUrl);
        const adsetsData = await adsetsResp.json();
        if (!adsetsResp.ok || !adsetsData || !Array.isArray(adsetsData.data)) {
            return res.status(502).json({ error: adsetsData?.error?.message || 'Failed to fetch adsets from master campaign', details: adsetsData?.error || adsetsData });
        }
        const adsetIds = adsetsData.data.map(d => d.id);

        // Helper: Facebook time format +0000
        function toFacebookDateFormat(date) {
            const pad = n => (n < 10 ? '0' + n : '' + n);
            const year = date.getUTCFullYear();
            const month = pad(date.getUTCMonth() + 1);
            const day = pad(date.getUTCDate());
            const hours = pad(date.getUTCHours());
            const minutes = pad(date.getUTCMinutes());
            const seconds = pad(date.getUTCSeconds());
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+0000`;
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + Number(durasi || 5));

        const createdAdsets = [];
        const acct = addAccountId.startsWith('act_') ? addAccountId : `act_${addAccountId}`;

        // 4) For each adset, fetch its details, then create new adset under target account
        for (const adSetId of adsetIds) {
            const detailUrl = `https://graph.facebook.com/v21.0/${adSetId}?fields=billing_event,optimization_goal,targeting,daily_budget&access_token=${encodeURIComponent(token)}`;
            const detailResp = await fetch(detailUrl);
            const oldAdSet = await detailResp.json();
            if (!detailResp.ok || oldAdSet?.error) {
                return res.status(502).json({ error: oldAdSet?.error?.message || 'Failed to fetch adset details', details: oldAdSet?.error || oldAdSet });
            }

            function sanitizeTargeting(src) {
                // Force minimal valid geo targeting: country ID only
                const t = {};
                t.geo_locations = { countries: ['ID'], location_types: ['home','recent'] };
                // Optionally keep basic age/gender if present and valid
                if (src && typeof src === 'object') {
                    if (typeof src.age_min === 'number') t.age_min = src.age_min;
                    if (typeof src.age_max === 'number') t.age_max = src.age_max;
                    if (Array.isArray(src.genders)) t.genders = src.genders;
                }
                return t;
            }

            const createUrl = `https://graph.facebook.com/v21.0/${acct}/adsets`;
            const payload = {
                access_token: token,
                name: `ON-${namaUsaha}`,
                campaign_id: newCampaignId,
                billing_event: oldAdSet.billing_event,
                optimization_goal: oldAdSet.optimization_goal,
                targeting: sanitizeTargeting(oldAdSet.targeting),
                daily_budget: String(oldAdSet.daily_budget || ''),
                start_time: toFacebookDateFormat(startDate),
                end_time: toFacebookDateFormat(endDate),
                status: 'PAUSED',
                destination_type: 'WHATSAPP',
                promoted_object: { page_id: pageId }
            };

            const resp = await fetch(createUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await resp.json();
            if (!resp.ok || result?.error) {
                console.error('Adset create payload failed:', { payload, resp_status: resp.status, result });
                return res.status(502).json({ error: result?.error?.message || 'Failed to create adset', details: result?.error || result });
            }
            createdAdsets.push(result.id);
        }

        // Optionally, reflect into local DB only on success
        await pool.query(
            `INSERT INTO campaigns (order_id, client_id, campaign_id, campaign_name, ad_account_id, status, impressions, clicks, ctr, spend, results, created_at, updated_at, result_type)
             VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0, 0, 0, 0, 0, NOW(), NOW(), 'Results')`,
            [order_id || null, client_id || null, newCampaignId, campaignName, addAccountId]
        );
        // Update content process to "Proses Iklan"
        if (order_id) {
            const [existC] = await pool.query('SELECT id FROM order_contents WHERE order_id = ? LIMIT 1', [order_id]);
            if (existC.length > 0) {
                await pool.query('UPDATE order_contents SET status = "Proses Iklan" WHERE order_id = ?', [order_id]);
            } else {
                await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Proses Iklan")', [order_id]);
            }
            try {
                const durationDays = Number(durasi) > 0 ? Number(durasi) : await getOrderDurationDays(order_id);
                const liveDate = new Date().toISOString().split('T')[0];
                await applyActualGoLiveDate(order_id, liveDate, durationDays);
            } catch (e) {
                console.error('Apply go_live_date on campaign duplicate error:', e);
            }
        }
        // Accrue advertiser commission and record finance
        try {
            const advUserIdRaw = req.body && (req.body.user_id || req.body.userId);
            const advRole = String((req.body && req.body.user_role) || '').toLowerCase();
            const advUserId = advUserIdRaw ? parseInt(advUserIdRaw) : null;
            if (advUserId && advRole === 'advertiser' && order_id) {
                let amount = 0;
                const [ord] = await pool.query('SELECT package_id FROM orders WHERE id = ? LIMIT 1', [order_id]);
                const pkgId = ord.length > 0 ? ord[0].package_id : null;
                if (pkgId) {
                    try {
                        const [rs] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'Advertiser', 'campaign']);
                        if (rs.length > 0 && rs[0].amount != null) amount = Number(rs[0].amount);
                        else {
                            const [rg] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'Advertiser', 'general']);
                            if (rg.length > 0 && rg[0].amount != null) amount = Number(rg[0].amount);
                        }
                    } catch (_) {
                        const [r2] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [pkgId, 'Advertiser']);
                        if (r2.length > 0 && r2[0].amount != null) amount = Number(r2[0].amount);
                    }
                }
                await pool.query(
                    `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                     VALUES (?, ?, 'Advertiser', 'campaign', ?)
                     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)`,
                    [order_id, advUserId, amount]
                );
                const [dup] = await pool.query(
                    'SELECT id FROM commission_ledger WHERE order_id = ? AND user_id = ? AND role = "Advertiser" AND source_event = "campaign_created" LIMIT 1',
                    [order_id, advUserId]
                );
                if (dup.length === 0) {
                    const [ledgerRes] = await pool.query(
                        'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, "Advertiser", "campaign", NULL, "flat", ?, ?, "accrued", "campaign_created")',
                        [order_id, advUserId, amount, amount]
                    );
                    const [txnRes] = await pool.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [order_id, amount]);
                    await pool.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnRes.insertId, ledgerRes.insertId]);
                }
            }
        } catch (e) {
            console.error('Advertiser commission on campaign duplicate error:', e);
        }

        res.json({ success: true, campaign_id: newCampaignId, adsets: createdAdsets });
    } catch (e) {
        console.error('Duplicate campaign error:', e);
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

// Campaigns by Client (with order status)
app.get('/api/clients/:id/campaigns', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(
            `SELECT c.*, o.status as order_status, o.id as order_id
             FROM campaigns c
             LEFT JOIN orders o ON c.order_id = o.id
             WHERE c.client_id = ? OR o.client_id = ?
             ORDER BY o.created_at ASC, c.created_at ASC`,
            [id, id]
        );
        res.json(rows);
    } catch (e) {
        console.error('Client campaigns error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Combined status for an order: type (Baru/Perpanjang), process (workflow), ad (Aktif/Tidak Aktif/Proses Iklan/Siap Iklan)
app.get('/api/orders/:id/combined-status', async (req, res) => {
    try {
        const { id } = req.params;
        // Base order
        const [orders] = await pool.query('SELECT status, client_id FROM orders WHERE id = ?', [id]);
        if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });
        const order = orders[0];
        const typeRaw = (order.status || '').toLowerCase();
        const type = (typeRaw === 'perpanjang' || typeRaw === 'extend' || typeRaw === 'repeat') ? 'Perpanjang' : 'Baru';
        // Content process
        const [contents] = await pool.query('SELECT status FROM order_contents WHERE order_id = ? LIMIT 1', [id]);
        let process = 'Menunggu';
        if (contents.length > 0 && contents[0].status) {
            const cs = (contents[0].status || '').toLowerCase();
            if (cs.includes('mulai konten')) process = 'Mulai Konten';
            else if (cs.includes('proses konten')) process = 'Proses Konten';
            else if (cs.includes('siap iklan')) process = 'Siap Iklan';
            else process = contents[0].status;
        }
        // Ad status from campaigns
        const [campaigns] = await pool.query('SELECT status FROM campaigns WHERE order_id = ?', [id]);
        let ad = 'Tidak Aktif';
        if (campaigns.length > 0) {
            const statuses = campaigns.map(c => (c.status || '').toUpperCase());
            if (statuses.some(s => s === 'ACTIVE')) ad = 'Aktif';
            else if (statuses.some(s => s === 'PAUSED' || s === 'ARCHIVED' || s === 'INACTIVE')) ad = 'Tidak Aktif';
            else ad = 'Proses Iklan';
        } else if (process === 'Siap Iklan') {
            ad = 'Siap Iklan';
        }
        res.json({ type, process, ad });
    } catch (e) {
        console.error('Combined status error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Editor Dashboard Stats
app.get('/api/dashboard/editor-stats', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.status(400).json({ error: 'user_id required' });
        const [waiting] = await pool.query(`
            SELECT COUNT(DISTINCT o.id) as count
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id AND oa.role = 'Editor' AND oa.user_id = ?
            JOIN order_contents oc ON oc.order_id = o.id
            WHERE LOWER(oc.status) = 'menunggu'
        `, [userId]);
        const [processing] = await pool.query(`
            SELECT COUNT(DISTINCT o.id) as count
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id AND oa.role = 'Editor' AND oa.user_id = ?
            JOIN order_contents oc ON oc.order_id = o.id
            WHERE LOWER(oc.status) = 'proses konten'
        `, [userId]);
        const [commission] = await pool.query(`
            SELECT COALESCE(SUM(commission_amount), 0) as total
            FROM order_assignments
            WHERE role = 'Editor' AND user_id = ?
        `, [userId]);
        const [contentMonth] = await pool.query(`
            SELECT COUNT(DISTINCT oc.id) as count
            FROM order_contents oc
            JOIN order_assignments oa ON oa.order_id = oc.order_id AND oa.role = 'Editor' AND oa.user_id = ?
            WHERE MONTH(oc.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(oc.created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        res.json({
            waitingClients: waiting[0].count || 0,
            processingClients: processing[0].count || 0,
            editorCommissionTotal: commission[0].total || 0,
            contentCreatedThisMonth: contentMonth[0].count || 0
        });
    } catch (e) {
        console.error('Editor stats error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/dashboard/advertiser-stats', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id required' });
    const [ready] = await pool.query(`
        SELECT COUNT(DISTINCT o.id) as count
        FROM orders o
        JOIN order_assignments oa ON o.id = oa.order_id AND oa.role = 'Advertiser' AND oa.user_id = ?
        JOIN order_contents oc ON oc.order_id = o.id
        WHERE LOWER(oc.status) = 'siap iklan'
    `, [userId]);
    const [monthlyAds] = await pool.query(`
        SELECT COUNT(DISTINCT c.id) as count
        FROM campaigns c
        JOIN order_assignments oa ON oa.order_id = c.order_id AND oa.role = 'Advertiser' AND oa.user_id = ?
        WHERE MONTH(c.created_at) = MONTH(CURRENT_DATE())
          AND YEAR(c.created_at) = YEAR(CURRENT_DATE())
    `, [userId]);
    const [commission] = await pool.query(`
        SELECT COALESCE(SUM(commission_amount), 0) as total
        FROM order_assignments
        WHERE role = 'Advertiser' AND user_id = ?
    `, [userId]);
    res.json({
      readyClients: ready[0].count || 0,
      monthlyAds: monthlyAds[0].count || 0,
      advertiserCommissionTotal: commission[0].total || 0
    });
  } catch (e) {
    console.error('Advertiser stats error:', e);
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
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;
        const { assigned_to, role, status, content_status } = req.query;

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

        if (content_status) {
            query += ` JOIN order_contents oc ON oc.order_id = o.id `;
            const cs = String(content_status).toLowerCase();
            let target = '';
            if (cs === 'otp') target = 'Proses OTP';
            else if (cs === 'menunggu') target = 'Menunggu';
            else if (cs === 'content' || cs === 'proses_konten') target = 'Proses Konten';
            else if (cs === 'ready' || cs === 'siap_iklan') target = 'Siap Iklan';
            if (target) {
                whereClauses.push(`LOWER(oc.status) LIKE LOWER(?)`);
                params.push(`%${target}%`);
            }
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

        let orders;
        try {
            [orders] = await pool.query(query, params);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code === 'ER_BAD_FIELD_ERROR' && query.includes('p.price as package_price')) {
                const fallbackQuery = query.replace('p.price as package_price', 'p.price_monthly as package_price');
                [orders] = await pool.query(fallbackQuery, params);
            } else {
                throw e;
            }
        }
        
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

        if (content_status) {
            countQuery += ` JOIN order_contents oc ON oc.order_id = o.id `;
            const cs = String(content_status).toLowerCase();
            let target = '';
            if (cs === 'otp') target = 'Proses OTP';
            else if (cs === 'menunggu') target = 'Menunggu';
            else if (cs === 'content' || cs === 'proses_konten') target = 'Proses Konten';
            else if (cs === 'ready' || cs === 'siap_iklan') target = 'Siap Iklan';
            if (target) {
                countWhere.push(`LOWER(oc.status) LIKE LOWER(?)`);
                countParams.push(`%${target}%`);
            }
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
        let isRepeat = false;
        let businessName = clientPayload.businessName || clientPayload.business_name || null;
        let whatsapp = clientPayload.whatsapp || clientPayload.wa || null;
        if (!clientId) {
            const name = clientPayload.name || '';
            const businessType = clientPayload.businessType || clientPayload.business_type || null;
            const address = clientPayload.address || null;

            if (!name) {
                return res.status(400).json({ error: 'client.name is required' });
            }

            if (businessName && whatsapp) {
                const [existingClients] = await connection.query(
                    'SELECT id FROM clients WHERE business_name = ? AND whatsapp = ? LIMIT 1',
                    [businessName, whatsapp]
                );
                if (existingClients.length > 0) {
                    clientId = existingClients[0].id;
                    isRepeat = true;
                }
            }

            if (!clientId) {
                const [clientResult] = await connection.query(
                    'INSERT INTO clients (name, business_name, business_type, whatsapp, address) VALUES (?, ?, ?, ?, ?)',
                    [name, businessName, businessType, whatsapp, address]
                );
                clientId = clientResult.insertId;
            }
        } else {
            isRepeat = true;
        }

        let status = orderPayload.status || '';
        let repeatOrderRaw = orderPayload.repeatOrder ?? orderPayload.repeat_order ?? 0;
        let repeatOrder = repeatOrderRaw === true || repeatOrderRaw === 1 || repeatOrderRaw === '1' || repeatOrderRaw === 'true' ? 1 : 0;
        if (isRepeat) {
            status = 'Perpanjang';
            repeatOrder = 1;
        } else {
            status = status || 'Baru';
        }

        const serviceType = orderPayload.serviceType || orderPayload.service_type || null;
        const metaDataRaw = orderPayload.metaData ?? orderPayload.meta_data ?? null;
        const metaData = metaDataRaw && typeof metaDataRaw !== 'string' ? JSON.stringify(metaDataRaw) : metaDataRaw;

        const startDate = orderPayload.startDate || orderPayload.start_date || (metaDataRaw && metaDataRaw.startDate) || null;
        const endDate = orderPayload.endDate || orderPayload.end_date || (metaDataRaw && metaDataRaw.endDate) || null;

        await ensureOrdersTimingColumns();
        await connection.beginTransaction();

        const startDateSource = startDate ? 'cs_estimate' : 'system';

        const [orderResult] = await connection.query(
            `INSERT INTO orders (client_id, package_id, status, repeat_order, start_date, end_date, service_type, meta_data, go_live_date, start_date_source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
            [clientId, packageId, status, repeatOrder, startDate, endDate, serviceType, metaData, startDateSource]
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
            const statusType = (status || '').toLowerCase() === 'perpanjang' ? 'extend' : 'new';
            // Try status-specific rule first, fallback to general
            const [rulesSpecific] = await connection.query(
                'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                [packageId, 'CS', statusType]
            );
            if (rulesSpecific.length > 0 && rulesSpecific[0].amount != null) {
                amount = rulesSpecific[0].amount;
            } else {
                const [rulesGeneral] = await connection.query(
                    'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                    [packageId, 'CS', 'general']
                );
                if (rulesGeneral.length > 0 && rulesGeneral[0].amount != null) {
                    amount = rulesGeneral[0].amount;
                }
            }

            await connection.query(
                `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                 VALUES (?, ?, 'CS', ?, ?)
                 ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)`,
                [orderId, csId, statusType, amount]
            );
            const [ledgerResAdminCS] = await connection.query(
                'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, ?, ?, NULL, "flat", ?, ?, "accrued", "created_order")',
                [orderId, csId, 'CS', statusType, amount, amount]
            );
            const [txnResAdminCS] = await connection.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [orderId, amount]);
            await connection.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnResAdminCS.insertId, ledgerResAdminCS.insertId]);
        } else if (userRole === 'cs') {
            const creatorIdRaw = body.userId || body.user_id;
            const creatorId = creatorIdRaw ? parseInt(creatorIdRaw) : null;
            if (creatorId) {
                let amount = 0;
                const statusType = (status || '').toLowerCase() === 'perpanjang' ? 'extend' : 'new';
                try {
                    const [rs] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [packageId, 'CS', statusType]);
                    if (rs.length > 0 && rs[0].amount != null) amount = Number(rs[0].amount);
                    else {
                        const [rg] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [packageId, 'CS', 'general']);
                        if (rg.length > 0 && rg[0].amount != null) amount = Number(rg[0].amount);
                    }
                } catch (_) {
                    const [r2] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [packageId, 'CS']);
                    if (r2.length > 0 && r2[0].amount != null) amount = Number(r2[0].amount);
                }
                await connection.query(
                    'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "CS", ?, ?)',
                    [orderId, creatorId, statusType, amount]
                );
                const [ledgerResCS] = await connection.query(
                    'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, ?, ?, NULL, "flat", ?, ?, "accrued", "created_order")',
                    [orderId, creatorId, 'CS', statusType, amount, amount]
                );
                const [txnResCS] = await connection.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [orderId, amount]);
                await connection.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnResCS.insertId, ledgerResCS.insertId]);
            }
        } else if (userRole === 'crm') {
            const creatorIdRaw = body.userId || body.user_id;
            const creatorId = creatorIdRaw ? parseInt(creatorIdRaw) : null;
            if (creatorId) {
                let amount = 0;
                let ctype = 'otp';
                try {
                    const [rs] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [packageId, 'CRM', 'otp']);
                    if (rs.length > 0 && rs[0].amount != null) amount = Number(rs[0].amount);
                    else {
                        const [rg] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [packageId, 'CRM', 'general']);
                        if (rg.length > 0 && rg[0].amount != null) { amount = Number(rg[0].amount); ctype = 'general'; }
                    }
                } catch (_) {
                    const [r2] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [packageId, 'CRM']);
                    if (r2.length > 0 && r2[0].amount != null) amount = Number(r2[0].amount);
                    ctype = 'general';
                }
                await connection.query(
                    'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "CRM", ?, ?)',
                    [orderId, creatorId, ctype, amount]
                );
                const [ledgerRes] = await connection.query(
                    'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, "CRM", ?, NULL, "flat", ?, ?, "accrued", "created_order_crm")',
                    [orderId, creatorId, ctype, amount, amount]
                );
                const [txnRes] = await connection.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [orderId, amount]);
                await connection.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnRes.insertId, ledgerRes.insertId]);
            }
        }
        
        await ensurePackagesSchema();
        let pkgRows;
        try {
            [pkgRows] = await connection.query('SELECT price FROM packages WHERE id = ? LIMIT 1', [packageId]);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code === 'ER_BAD_FIELD_ERROR') {
                [pkgRows] = await connection.query('SELECT price_monthly as price FROM packages WHERE id = ? LIMIT 1', [packageId]);
            } else {
                throw e;
            }
        }
        const incomeAmount = (pkgRows && pkgRows.length > 0 && pkgRows[0].price != null) ? Number(pkgRows[0].price) : 0;
        await connection.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "income", ?)', [orderId, incomeAmount]);

        const initialStatus = (userRole === 'cs' || userRole === 'crm') ? 'Menunggu' : 'Proses OTP';
        await connection.query(
            'INSERT INTO order_contents (order_id, status) VALUES (?, ?)',
            [orderId, initialStatus]
        );

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

app.post('/api/orders/:id/renew', async (req, res) => {
    ensureEnv();
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const body = req.body || {};
        const orderPayload = body.order || {};
        const detailsPayload = body.details || null;
        const targetsPayload = body.targets || null;
        const userRole = (body.userRole || body.user_role || '').toString().toLowerCase();

        await ensureOrdersExtraColumns();
        await ensureOrdersRenewalColumns();
        await ensureOrdersTimingColumns();
        await ensurePackagesSchema();

        const [baseOrders] = await connection.query(
            'SELECT * FROM orders WHERE id = ? LIMIT 1',
            [id]
        );
        if (!baseOrders.length) {
            return res.status(404).json({ error: 'Order asal tidak ditemukan' });
        }
        const baseOrder = baseOrders[0];

        const packageId = orderPayload.packageId || orderPayload.package_id || body.packageId || body.package_id || baseOrder.package_id;
        if (!packageId) {
            return res.status(400).json({ error: 'packageId wajib diisi' });
        }

        const serviceType = orderPayload.serviceType || orderPayload.service_type || baseOrder.service_type || null;
        const baseMetaData = baseOrder.meta_data;
        const metaDataRaw = orderPayload.metaData ?? orderPayload.meta_data ?? baseMetaData ?? null;
        const metaData = metaDataRaw && typeof metaDataRaw !== 'string' ? JSON.stringify(metaDataRaw) : metaDataRaw;

        const startDate = orderPayload.startDate || orderPayload.start_date || body.startDate || body.start_date || null;
        const endDate = orderPayload.endDate || orderPayload.end_date || body.endDate || body.end_date || null;
        const renewalCount = Number(baseOrder.renewal_count || 0) + 1;

        await connection.beginTransaction();

        const startDateSource = startDate ? 'cs_estimate' : 'system';
        const [orderResult] = await connection.query(
            `INSERT INTO orders (client_id, package_id, status, repeat_order, start_date, end_date, service_type, meta_data, parent_order_id, renewal_count, go_live_date, start_date_source)
             VALUES (?, ?, 'Perpanjang', 1, ?, ?, ?, ?, ?, ?, NULL, ?)`,
            [baseOrder.client_id, packageId, startDate, endDate, serviceType, metaData, baseOrder.id, renewalCount, startDateSource]
        );
        const newOrderId = orderResult.insertId;

        const [baseDetailsRows] = await connection.query(
            'SELECT description, advantages, uniqueness, promo FROM order_details WHERE order_id = ? LIMIT 1',
            [baseOrder.id]
        );
        const baseDetails = baseDetailsRows[0] || {};
        const description = detailsPayload && detailsPayload.description !== undefined ? detailsPayload.description : (baseDetails.description ?? null);
        const advantages = detailsPayload && detailsPayload.advantages !== undefined ? detailsPayload.advantages : (baseDetails.advantages ?? null);
        const uniqueness = detailsPayload && detailsPayload.uniqueness !== undefined ? detailsPayload.uniqueness : (baseDetails.uniqueness ?? null);
        const promo = detailsPayload && detailsPayload.promo !== undefined ? detailsPayload.promo : (baseDetails.promo ?? null);
        if (description || advantages || uniqueness || promo) {
            await connection.query(
                'INSERT INTO order_details (order_id, description, advantages, uniqueness, promo) VALUES (?, ?, ?, ?, ?)',
                [newOrderId, description, advantages, uniqueness, promo]
            );
        }

        const [baseTargetsRows] = await connection.query(
            'SELECT locations, age_range, gender FROM order_targets WHERE order_id = ? LIMIT 1',
            [baseOrder.id]
        );
        const baseTargets = baseTargetsRows[0] || {};
        const locations = targetsPayload && targetsPayload.locations !== undefined ? targetsPayload.locations : (baseTargets.locations ?? null);
        const ageRange = targetsPayload && (targetsPayload.ageRange !== undefined || targetsPayload.age_range !== undefined)
            ? (targetsPayload.ageRange ?? targetsPayload.age_range ?? null)
            : (baseTargets.age_range ?? null);
        const gender = targetsPayload && targetsPayload.gender !== undefined ? targetsPayload.gender : (baseTargets.gender ?? null);
        if (locations || ageRange || gender) {
            await connection.query(
                'INSERT INTO order_targets (order_id, locations, age_range, gender) VALUES (?, ?, ?, ?)',
                [newOrderId, locations, ageRange, gender]
            );
        }

        const [assignments] = await connection.query(
            'SELECT user_id, role, content_type FROM order_assignments WHERE order_id = ?',
            [baseOrder.id]
        );
        for (const a of assignments) {
            const roleName = String(a.role || '');
            const contentTypeRaw = String(a.content_type || '').toLowerCase();
            const ruleType = roleName === 'CS'
                ? 'extend'
                : (contentTypeRaw || 'general');

            let amount = 0;
            const [rulesSpecific] = await connection.query(
                'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ? LIMIT 1',
                [packageId, roleName, ruleType]
            );
            if (rulesSpecific.length && rulesSpecific[0].amount != null) {
                amount = Number(rulesSpecific[0].amount);
            } else {
                const [rulesGeneral] = await connection.query(
                    'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ? LIMIT 1',
                    [packageId, roleName, 'general']
                );
                if (rulesGeneral.length && rulesGeneral[0].amount != null) {
                    amount = Number(rulesGeneral[0].amount);
                } else {
                    const [rulesAny] = await connection.query(
                        'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? LIMIT 1',
                        [packageId, roleName]
                    );
                    if (rulesAny.length && rulesAny[0].amount != null) {
                        amount = Number(rulesAny[0].amount);
                    }
                }
            }

            await connection.query(
                `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                 VALUES (?, ?, ?, ?, ?)`,
                [newOrderId, a.user_id, roleName, ruleType, amount]
            );

            const [ledgerRes] = await connection.query(
                `INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event)
                 VALUES (?, ?, ?, ?, NULL, "flat", ?, ?, "accrued", "renew_order")`,
                [newOrderId, a.user_id, roleName, ruleType, amount, amount]
            );
            const [txnRes] = await connection.query(
                'INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)',
                [newOrderId, amount]
            );
            await connection.query(
                'UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?',
                [txnRes.insertId, ledgerRes.insertId]
            );
        }

        let pkgRows;
        try {
            [pkgRows] = await connection.query('SELECT price FROM packages WHERE id = ? LIMIT 1', [packageId]);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code === 'ER_BAD_FIELD_ERROR') {
                [pkgRows] = await connection.query('SELECT price_monthly as price FROM packages WHERE id = ? LIMIT 1', [packageId]);
            } else {
                throw e;
            }
        }
        const incomeAmount = (pkgRows && pkgRows.length > 0 && pkgRows[0].price != null) ? Number(pkgRows[0].price) : 0;
        await connection.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "income", ?)', [newOrderId, incomeAmount]);

        const initialStatus = (userRole === 'cs' || userRole === 'crm') ? 'Menunggu' : 'Proses OTP';
        await connection.query(
            'INSERT INTO order_contents (order_id, status) VALUES (?, ?)',
            [newOrderId, initialStatus]
        );

        await connection.commit();
        res.json({ success: true, orderId: newOrderId });
    } catch (e) {
        try { await connection.rollback(); } catch (_) {}
        console.error('Renew order error:', e);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// Finance Orders Endpoint
app.get('/api/finance/orders', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const existsFilter = (startDate && endDate) ? 'AND DATE(ti.created_at) BETWEEN ? AND ?' : '';
        const query = `
            SELECT o.*, c.name as client_name, p.name as package_name, p.price as package_price,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE order_id = o.id AND type = 'income' AND DATE(created_at) BETWEEN ? AND ?) as total_income,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE order_id = o.id AND type IN ('commission','commission_pay') AND DATE(created_at) BETWEEN ? AND ?) as total_commission_paid,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE order_id = o.id AND type = 'expense' AND DATE(created_at) BETWEEN ? AND ?) as total_expense
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
            WHERE EXISTS (
                SELECT 1 FROM transactions ti
                WHERE ti.order_id = o.id 
                  AND ti.type IN ('income','commission','commission_pay','expense')
                  ${existsFilter}
            )
            ORDER BY o.created_at DESC
        `;
        
        const params = [];
        if (startDate && endDate) {
            params.push(startDate, endDate); // income
            params.push(startDate, endDate); // commission
            params.push(startDate, endDate); // expense
            params.push(startDate, endDate); // EXISTS filter
        } else {
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
            params.push(first, last, first, last, first, last);
        }

        await ensurePackagesSchema();
        let orders;
        try {
            [orders] = await pool.query(query, params);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code === 'ER_BAD_FIELD_ERROR' && query.includes('p.price as package_price')) {
                const fallbackQuery = query.replace('p.price as package_price', 'p.price_monthly as package_price');
                [orders] = await pool.query(fallbackQuery, params);
            } else {
                throw e;
            }
        }
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

// Commission Ledger Endpoints
app.post('/api/commissions/accrue-from-order', async (req, res) => {
    try {
        const { order_id, user_id, role } = req.body || {};
        if (!order_id || !user_id || !role) {
            return res.status(400).json({ error: 'order_id, user_id, and role are required' });
        }
        const [orders] = await pool.query('SELECT id, package_id, status FROM orders WHERE id = ?', [order_id]);
        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const order = orders[0];
        const statusLower = String(order.status || '').toLowerCase();
        const contentType = statusLower.includes('perpanjang') ? 'extend' : (statusLower.includes('baru') || statusLower.includes('new') ? 'new' : 'general');
        let ruleAmount = 0;
        if (order.package_id) {
            try {
                const [ruleSpecific] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [order.package_id, role, contentType]);
                if (ruleSpecific.length > 0 && ruleSpecific[0].amount != null) {
                    ruleAmount = Number(ruleSpecific[0].amount);
                } else {
                    const [ruleGeneral] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [order.package_id, role, 'general']);
                    if (ruleGeneral.length > 0 && ruleGeneral[0].amount != null) {
                        ruleAmount = Number(ruleGeneral[0].amount);
                    }
                }
            } catch (e) {
                const [r2] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [order.package_id, role]);
                if (r2.length > 0 && r2[0].amount != null) ruleAmount = Number(r2[0].amount);
            }
        }
        await pool.query(`
            INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event)
            VALUES (?, ?, ?, ?, NULL, 'flat', ?, ?, 'accrued', 'created_order')
        `, [order_id, user_id, role, contentType, ruleAmount, ruleAmount]);
        res.json({ success: true });
    } catch (e) {
        console.error('Accrue commission error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/commissions/ledger', async (req, res) => {
    try {
        const { order_id, user_id, status } = req.query || {};
        let sql = `SELECT * FROM commission_ledger WHERE 1=1`;
        const params = [];
        if (order_id) { sql += ' AND order_id = ?'; params.push(order_id); }
        if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
        if (status) { sql += ' AND status = ?'; params.push(status); }
        sql += ' ORDER BY created_at DESC';
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (e) {
        console.error('Fetch ledger error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/commissions/payouts', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { period_start, period_end } = req.body || {};
        if (!period_start || !period_end) {
            connection.release();
            return res.status(400).json({ error: 'period_start and period_end are required' });
        }
        await connection.beginTransaction();
        const [batchRes] = await connection.query(`
            INSERT INTO payout_batch (period_start, period_end, status, total_amount)
            VALUES (?, ?, 'draft', 0)
        `, [period_start, period_end]);
        const batchId = batchRes.insertId;
        const [items] = await connection.query(`
            SELECT * FROM commission_ledger
            WHERE status IN ('accrued','approved')
              AND DATE(created_at) BETWEEN ? AND ?
        `, [period_start, period_end]);
        let total = 0;
        for (const it of items) {
            const amount = Number(it.amount || 0);
            total += amount;
            const [txnRes] = await connection.query(`
                INSERT INTO transactions (order_id, type, amount)
                VALUES (?, 'commission', ?)
            `, [it.order_id, amount]);
            const txnId = txnRes.insertId;
            await connection.query(`
                UPDATE commission_ledger SET status = 'paid', ref_txn_id = ?, posted_at = NOW() WHERE id = ?
            `, [txnId, it.id]);
            await connection.query(`
                INSERT INTO payout_batch_items (batch_id, ledger_id, amount)
                VALUES (?, ?, ?)
            `, [batchId, it.id, amount]);
        }
        await connection.query(`UPDATE payout_batch SET total_amount = ?, status = 'posted', posted_at = NOW() WHERE id = ?`, [total, batchId]);
        await connection.commit();
        res.json({ success: true, batch_id: batchId, total_amount: total, items: items.length });
    } catch (e) {
        try { await connection.rollback(); } catch(_) {}
        console.error('Payout error:', e);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});
// Order Assignments Endpoints
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get Order
        await ensurePackagesSchema();
        let orders;
        const baseQuery = `
            SELECT o.*, p.name as package_name, p.price as package_price
            FROM orders o
            LEFT JOIN packages p ON o.package_id = p.id
            WHERE o.id = ?
        `;
        try {
            [orders] = await pool.query(baseQuery, [id]);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code === 'ER_BAD_FIELD_ERROR' && baseQuery.includes('p.price as package_price')) {
                const fallbackQuery = baseQuery.replace('p.price as package_price', 'p.price_monthly as package_price');
                [orders] = await pool.query(fallbackQuery, [id]);
            } else {
                throw e;
            }
        }

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

app.get('/api/commissions/payouts', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM payout_batch ORDER BY created_at DESC`);
        res.json(rows);
    } catch (e) {
        console.error('List payouts error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/commissions/payouts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [items] = await pool.query(`
            SELECT pbi.*, cl.order_id, cl.user_id, cl.role, cl.amount, cl.content_type, u.name as user_name, o.client_id
            FROM payout_batch_items pbi
            JOIN commission_ledger cl ON pbi.ledger_id = cl.id
            LEFT JOIN users u ON cl.user_id = u.id
            LEFT JOIN orders o ON cl.order_id = o.id
            WHERE pbi.batch_id = ?
            ORDER BY pbi.created_at DESC
        `, [id]);
        res.json(items);
    } catch (e) {
        console.error('Get payout items error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/orders/:id/payments', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const body = req.body || {};
        const amount = Number(body.amount || 0);
        const method = body.method || 'transfer';
        if (!id || !amount || amount <= 0) {
            connection.release();
            return res.status(400).json({ error: 'amount is required and must be > 0' });
        }
        await connection.beginTransaction();
        const [orders] = await connection.query('SELECT id, package_id, status FROM orders WHERE id = ? LIMIT 1', [id]);
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Order not found' });
        }
        const order = orders[0];
        await connection.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "income", ?)', [id, amount]);
        const [assignments] = await connection.query('SELECT user_id, role FROM order_assignments WHERE order_id = ?', [id]);
        const statusLower = String(order.status || '').toLowerCase();
        const contentType = statusLower.includes('perpanjang') ? 'extend' : (statusLower.includes('baru') || statusLower.includes('new') ? 'new' : 'general');
        // Helper: get rule amount with fallback when content_type column doesn't exist
        async function getRuleAmount(role, ctype) {
            if (!order.package_id) return 0;
            try {
                const [rs] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [order.package_id, role, ctype]);
                if (rs.length > 0 && rs[0].amount != null) return Number(rs[0].amount);
                const [rg] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [order.package_id, role, 'general']);
                if (rg.length > 0 && rg[0].amount != null) return Number(rg[0].amount);
            } catch (e) {
                const [r2] = await connection.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [order.package_id, role]);
                if (r2.length > 0 && r2[0].amount != null) return Number(r2[0].amount);
            }
            return 0;
        }
        for (const a of assignments) {
            const ruleAmount = await getRuleAmount(a.role, contentType);
            await connection.query(
                'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, ?, ?, ?, "flat", ?, ?, "accrued", "payment_income")',
                [id, a.user_id, a.role, contentType, amount, ruleAmount, ruleAmount]
            );
        }
        await connection.commit();
        res.json({ success: true });
    } catch (e) {
        try { await connection.rollback(); } catch(_) {}
        console.error('Payment endpoint error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Internal server error' });
    } finally {
        connection.release();
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

        // 1. Get Package ID and Status to calculate commission
        const [orders] = await pool.query('SELECT package_id, status FROM orders WHERE id = ?', [id]);
        if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });
        const packageId = orders[0].package_id;
        const orderStatus = (orders[0].status || '').toLowerCase();

        // 2. Get Commission Rule
        let amount = 0;
        // Compute content type depending on order status if not specified
        let effectiveContentType = finalContentType;
        if (!effectiveContentType || effectiveContentType === 'general') {
            effectiveContentType = orderStatus === 'perpanjang' ? 'extend' : 'new';
        }
        if (packageId) {
            // Try status-specific rule, fallback to general
            const [rulesSpecific] = await pool.query(
                'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                [packageId, role, effectiveContentType]
            );
            if (rulesSpecific.length > 0) {
                amount = rulesSpecific[0].amount;
            } else {
                const [rulesGeneral] = await pool.query(
                    'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                    [packageId, role, 'general']
                );
                if (rulesGeneral.length > 0) {
                    amount = rulesGeneral[0].amount;
                }
            }
        }

        // 3. Upsert Assignment
        // Check if exists
        const [existing] = await pool.query(
            'SELECT id FROM order_assignments WHERE order_id = ? AND role = ? AND content_type = ?',
            [id, role, effectiveContentType]
        );

        if (existing.length > 0) {
            await pool.query(
                'UPDATE order_assignments SET user_id = ?, commission_amount = ? WHERE id = ?',
                [finalUserId, amount, existing[0].id]
            );
        } else {
            await pool.query(
                'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, ?, ?, ?)',
                [id, finalUserId, role, effectiveContentType, amount]
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
        const body = req.body || {};
        const crmUserIdRaw = body.userId || body.user_id;
        
        // Upsert status
        const [existing] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
        
        if (existing.length > 0) {
            await pool.query('UPDATE order_contents SET status = "Proses Konten" WHERE order_id = ?', [id]);
        } else {
            await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Proses Konten")', [id]);
        }

        // Accrue CRM commission on OTP -> Proses Konten transition and record finance
        try {
            // Determine CRM user: from body or existing assignment
            let crmUserId = crmUserIdRaw ? parseInt(crmUserIdRaw) : null;
            if (!crmUserId) {
                const [crmAssign] = await pool.query('SELECT user_id FROM order_assignments WHERE order_id = ? AND role = "CRM" LIMIT 1', [id]);
                if (crmAssign.length > 0) crmUserId = crmAssign[0].user_id;
            }
            // Only proceed if we have a CRM user
            if (crmUserId) {
                // Idempotency: skip if ledger already exists for this event
                const [dup] = await pool.query(
                    'SELECT id FROM commission_ledger WHERE order_id = ? AND user_id = ? AND role = "CRM" AND source_event = "otp_to_content" LIMIT 1',
                    [id, crmUserId]
                );
                if (dup.length === 0) {
                    // Compute commission amount from rules (prefer content_type 'otp', fallback 'general')
                    let amount = 0;
                    // Get package id
                    const [ord] = await pool.query('SELECT package_id FROM orders WHERE id = ? LIMIT 1', [id]);
                    const pkgId = ord.length > 0 ? ord[0].package_id : null;
                    if (pkgId) {
                        try {
                            const [rs] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'CRM', 'otp']);
                            if (rs.length > 0 && rs[0].amount != null) amount = Number(rs[0].amount);
                            else {
                                const [rg] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'CRM', 'general']);
                                if (rg.length > 0 && rg[0].amount != null) amount = Number(rg[0].amount);
                            }
                        } catch (_) {
                            const [r2] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [pkgId, 'CRM']);
                            if (r2.length > 0 && r2[0].amount != null) amount = Number(r2[0].amount);
                        }
                    }
                    // Upsert assignment if none
                    const [hasAssign] = await pool.query('SELECT id FROM order_assignments WHERE order_id = ? AND role = "CRM" LIMIT 1', [id]);
                    if (hasAssign.length === 0) {
                        await pool.query(
                            'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "CRM", "otp", ?)',
                            [id, crmUserId, amount]
                        );
                    } else {
                        await pool.query(
                            'UPDATE order_assignments SET user_id = ?, commission_amount = ? WHERE id = ?',
                            [crmUserId, amount, hasAssign[0].id]
                        );
                    }
                    // Create ledger accrued
                    const [ledgerRes] = await pool.query(
                        'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, "CRM", "otp", NULL, "flat", ?, ?, "accrued", "otp_to_content")',
                        [id, crmUserId, amount, amount]
                    );
                    const ledgerId = ledgerRes.insertId;
                    // Record finance immedately as commission transaction and mark ledger paid
                    const [txnRes] = await pool.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [id, amount]);
                    const txnId = txnRes.insertId;
                    await pool.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnId, ledgerId]);
                }
            }
        } catch (e) {
            console.error('CRM commission on OTP->Content error:', e);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Start content error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/content/otp', async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};
        const crmUserIdRaw = body.userId || body.user_id;
        const [existing] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
        if (existing.length > 0) {
            await pool.query('UPDATE order_contents SET status = "Proses OTP" WHERE order_id = ?', [id]);
        } else {
            await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Proses OTP")', [id]);
        }
        try {
            // Hanya lakukan akru komisi dan auto-advance jika request berasal dari CRM (punya user_id)
            if (crmUserIdRaw) {
                let crmUserId = parseInt(crmUserIdRaw);
                const [dup] = await pool.query(
                    'SELECT id FROM commission_ledger WHERE order_id = ? AND user_id = ? AND role = "CRM" AND source_event = "otp_sent" LIMIT 1',
                    [id, crmUserId]
                );
                if (dup.length === 0) {
                    let amount = 0;
                    const [ord] = await pool.query('SELECT package_id FROM orders WHERE id = ? LIMIT 1', [id]);
                    const pkgId = ord.length > 0 ? ord[0].package_id : null;
                    if (pkgId) {
                        try {
                            const [rs] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'CRM', 'otp']);
                            if (rs.length > 0 && rs[0].amount != null) amount = Number(rs[0].amount);
                            else {
                                const [rg] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?', [pkgId, 'CRM', 'general']);
                                if (rg.length > 0 && rg[0].amount != null) amount = Number(rg[0].amount);
                            }
                        } catch (_) {
                            const [r2] = await pool.query('SELECT amount FROM commission_rules WHERE package_id = ? AND role = ?', [pkgId, 'CRM']);
                            if (r2.length > 0 && r2[0].amount != null) amount = Number(r2[0].amount);
                        }
                    }
                    await pool.query(
                        'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "CRM", "otp", ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)',
                        [id, crmUserId, amount]
                    );
                    const [ledgerRes] = await pool.query(
                        'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, "CRM", "otp", NULL, "flat", ?, ?, "accrued", "otp_sent")',
                        [id, crmUserId, amount, amount]
                    );
                    const [txnRes] = await pool.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [id, amount]);
                    await pool.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnRes.insertId, ledgerRes.insertId]);
                }
                // Auto-advance process to "Proses Konten" after OTP send by CRM
                try {
                    const [exist2] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
                    if (exist2.length > 0) {
                        await pool.query('UPDATE order_contents SET status = "Proses Konten" WHERE order_id = ?', [id]);
                    } else {
                        await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Proses Konten")', [id]);
                    }
                } catch (e) {
                    console.error('Advance to Proses Konten error:', e);
                }
            }
        } catch (e) {
            console.error('CRM commission on OTP sent error:', e);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Set OTP error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/content/ready', async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
        if (existing.length > 0) {
            await pool.query('UPDATE order_contents SET status = "Siap Iklan" WHERE order_id = ?', [id]);
        } else {
            await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Siap Iklan")', [id]);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Set Ready error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/content/submit', async (req, res) => {
    try {
        const { id } = req.params;
        const { links, userId, userRole } = req.body; // Array of { url, description, type }

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

        // 3. If action by Editor, calculate and upsert commission assignment
        try {
            const roleLower = String(userRole || '').toLowerCase();
            if (userId && roleLower === 'editor') {
                const [ord] = await pool.query('SELECT package_id, status FROM orders WHERE id = ?', [id]);
                if (ord.length > 0) {
                    const packageId = ord[0].package_id;
                    let amount = 0;
                    let ctype = 'general';
                    const linkTypes = Array.isArray(links) ? links.map(l => String(l.type || '').toLowerCase()) : [];
                    if (linkTypes.includes('video')) ctype = 'video';
                    else if (linkTypes.includes('image')) ctype = 'image';
                    if (packageId) {
                        // Prefer general rule for Editor, fallback to image+video sum
                        const [gen] = await pool.query(
                            'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                            [packageId, 'Editor', 'general']
                        );
                        if (gen.length > 0 && gen[0].amount != null) {
                            amount = parseFloat(gen[0].amount) || 0;
                        } else {
                            const [img] = await pool.query(
                                'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                                [packageId, 'Editor', 'image']
                            );
                            const [vid] = await pool.query(
                                'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ?',
                                [packageId, 'Editor', 'video']
                            );
                            const aImg = img.length > 0 && img[0].amount != null ? parseFloat(img[0].amount) || 0 : 0;
                            const aVid = vid.length > 0 && vid[0].amount != null ? parseFloat(vid[0].amount) || 0 : 0;
                            amount = aImg + aVid;
                            ctype = (aVid > 0) ? 'video' : ((aImg > 0) ? 'image' : 'general');
                        }
                    }
                    await pool.query(
                        `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                         VALUES (?, ?, 'Editor', ?, ?)
                         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)`,
                        [id, userId, ctype, amount]
                    );
                    const [dup] = await pool.query(
                        'SELECT id FROM commission_ledger WHERE order_id = ? AND user_id = ? AND role = "Editor" AND source_event = "content_ready" LIMIT 1',
                        [id, userId]
                    );
                    if (dup.length === 0) {
                        const [ledgerRes] = await pool.query(
                            'INSERT INTO commission_ledger (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event) VALUES (?, ?, "Editor", ?, NULL, "flat", ?, ?, "accrued", "content_ready")',
                            [id, userId, ctype, amount, amount]
                        );
                        const [txnRes] = await pool.query('INSERT INTO transactions (order_id, type, amount) VALUES (?, "commission", ?)', [id, amount]);
                        await pool.query('UPDATE commission_ledger SET status = "paid", ref_txn_id = ?, posted_at = NOW() WHERE id = ?', [txnRes.insertId, ledgerRes.insertId]);
                    }
                }
            }
        } catch (e) {
            console.error('Auto-assign editor commission error:', e);
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
