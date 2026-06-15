const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const https = require('https');
// const cors = require('cors'); // Cors not installed in package.json

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({
    limit: '12mb',
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
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
});

// Database Connection
const DATABASE_URL = process.env.MYSQL_URL || process.env.DATABASE_URL;
let pool;
if (DATABASE_URL) {
    pool = mysql.createPool(DATABASE_URL);
} else {
    const host = process.env.MYSQL_HOST;
    const user = process.env.MYSQL_USER;
    const password = process.env.MYSQL_PASSWORD;
    const database = process.env.MYSQL_DATABASE;
    const port = process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306;

    if (host && user && database) {
        pool = mysql.createPool({ host, user, password, database, port });
    } else {
        const envPath = path.join(__dirname, '.env');
        const envStatus = fs.existsSync(envPath) ? 'exists' : 'not found';
        console.error(`Missing database env. Set MYSQL_URL (recommended) or MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE. .env ${envStatus} at ${envPath}`);
        process.exit(1);
    }
}

// Helper function for Scalev code compatibility
const getPool = () => pool;

// Helper function to ensure environment is ready (mock implementation)
function ensureEnv() {
    const hasUrl = Boolean(process.env.MYSQL_URL || process.env.DATABASE_URL);
    const hasParts = Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
    if (!hasUrl && !hasParts) {
        throw new Error('Database env is missing');
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

async function ensureTransactionsCategoryColumn() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE transactions ADD COLUMN category VARCHAR(50)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE transactions ADD COLUMN trx_date DATE`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE transactions ADD COLUMN employee_user_id INT NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE transactions ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`UPDATE transactions SET category = 'Pembayaran Order (Pelunasan)' WHERE type = 'income' AND order_id IS NOT NULL AND category IS NULL`);
        } catch (e) {
            console.error('Error backfilling transaction categories:', e);
        }
        try {
            await p.query(`UPDATE transactions SET updated_at = created_at WHERE updated_at IS NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_BAD_FIELD_ERROR') {
                console.error('Error backfilling transaction updated_at:', e);
            }
        }
        console.log('Transactions category columns ready');
    } catch (e) {
        console.error('Error ensuring transactions category columns:', e);
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
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN payment_total_amount DECIMAL(15,2) NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN payment_dp_amount DECIMAL(15,2) NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE orders ADD COLUMN payment_remaining_amount DECIMAL(15,2) NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`UPDATE orders SET payment_status = 'Lunas' WHERE payment_status IS NULL OR TRIM(payment_status) = ''`);
        } catch (e) {
            console.error('Error backfilling orders payment_status:', e);
        }
        console.log('Orders extra columns ready');
    } catch (e) {
        console.error('Error ensuring orders extra columns:', e);
    }
}

function normalizePaymentStatus(value, fallback = 'Lunas') {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === 'dp' || raw === 'down payment' || raw === 'partial' || raw === 'partially_paid') return 'DP';
    if (raw === 'lunas' || raw === 'paid' || raw === 'full' || raw === 'settled') return 'Lunas';
    return fallback;
}

function normalizeMoney(value, fallback = 0) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^\d.-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolvePackagePrice(conn, packageId) {
    if (!packageId) return 0;
    try {
        const [rows] = await conn.query('SELECT price FROM packages WHERE id = ? LIMIT 1', [packageId]);
        if (rows.length > 0 && rows[0].price != null) return Number(rows[0].price) || 0;
    } catch (e) {
        const code = String((e && e.code) || '');
        if (code !== 'ER_BAD_FIELD_ERROR') throw e;
        const [fallbackRows] = await conn.query('SELECT price_monthly as price FROM packages WHERE id = ? LIMIT 1', [packageId]);
        if (fallbackRows.length > 0 && fallbackRows[0].price != null) return Number(fallbackRows[0].price) || 0;
    }
    return 0;
}

async function buildOrderPaymentSummary(conn, packageId, requestedStatus, requestedDpAmount) {
    const totalAmount = await resolvePackagePrice(conn, packageId);
    const paymentStatus = normalizePaymentStatus(requestedStatus, 'DP');
    let dpAmount = Math.max(0, normalizeMoney(requestedDpAmount, 0));
    let remainingAmount = 0;

    if (paymentStatus === 'DP') {
        if (totalAmount > 0) {
            if (!(dpAmount > 0 && dpAmount < totalAmount)) {
                throw new Error('Nominal DP harus lebih dari 0 dan lebih kecil dari total paket');
            }
            remainingAmount = Math.max(totalAmount - dpAmount, 0);
        } else if (!(dpAmount > 0)) {
            throw new Error('Nominal DP wajib diisi');
        }
    } else {
        dpAmount = totalAmount > 0 ? totalAmount : dpAmount;
        remainingAmount = 0;
    }

    return {
        paymentStatus,
        totalAmount,
        dpAmount,
        remainingAmount
    };
}

async function insertOrderPaymentTransaction(conn, { orderId, amount, category, note = null, trxDate = null }) {
    const normalizedAmount = Math.max(0, normalizeMoney(amount, 0));
    if (!orderId || normalizedAmount <= 0) return;
    await conn.query(
        'INSERT INTO transactions (order_id, type, amount, category, note, trx_date) VALUES (?, "income", ?, ?, ?, ?)',
        [orderId, normalizedAmount, category || 'Pembayaran Order', note, trxDate]
    );
}

async function accrueCsCommissionOnOrderLunas(conn, orderId) {
    const [orderRows] = await conn.query('SELECT id, package_id, status FROM orders WHERE id = ? LIMIT 1', [orderId]);
    if (!orderRows.length) return;
    const order = orderRows[0];
    const defaultContentType = String(order.status || '').toLowerCase().includes('perpanjang') ? 'extend' : 'new';
    const [assignments] = await conn.query(
        'SELECT user_id, content_type, commission_amount FROM order_assignments WHERE order_id = ? AND role = "CS"',
        [orderId]
    );
    for (const assignment of assignments) {
        const userId = Number(assignment.user_id || 0);
        if (!userId) continue;
        const contentType = String(assignment.content_type || '').trim() || defaultContentType;
        let amount = Number(assignment.commission_amount || 0);
        if (!amount && order.package_id) {
            amount = await resolveCommissionAmount(conn, order.package_id, 'CS', contentType);
        }
        await accrueCommissionLedger({
            order_id: orderId,
            user_id: userId,
            role: 'CS',
            content_type: contentType,
            amount,
            source_event: 'order_lunas',
            source_event_key: `order_lunas:${orderId}:${userId}:CS:${contentType}`
        }, conn);
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

async function ensureMetaAdsConfigSchema() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE meta_ads_configs ADD COLUMN access_token LONGTEXT`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`ALTER TABLE meta_ads_configs ADD COLUMN is_active TINYINT(1) DEFAULT 1`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        console.log('Meta ads config schema ready');
    } catch (e) {
        console.error('Error ensuring meta ads config schema:', e);
    }
}

async function ensureCampaignsSchema() {
    try {
        const p = await getPool();
        try {
            await p.query(`ALTER TABLE campaigns ADD COLUMN result_type VARCHAR(60) NULL`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await p.query(`UPDATE campaigns SET result_type = 'Results' WHERE result_type IS NULL OR result_type = ''`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_BAD_FIELD_ERROR') throw e;
        }
        console.log('Campaigns schema ready');
    } catch (e) {
        console.error('Error ensuring campaigns schema:', e);
    }
}

async function ensureCsEditorAssignmentsTable() {
    try {
        const p = await getPool();
        await p.query(`
            CREATE TABLE IF NOT EXISTS cs_editor_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cs_user_id INT NOT NULL,
                editor_user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_cs_editor_cs (cs_user_id),
                KEY idx_cs_editor_editor (editor_user_id)
            )
        `);
        console.log('CS editor assignments table ready');
    } catch (e) {
        console.error('Error ensuring cs editor assignments table:', e);
    }
}

async function getMetaAccessToken() {
    await ensureMetaAdsConfigSchema();
    let rows = [];
    try {
        [rows] = await pool.query(
            "SELECT access_token FROM meta_ads_configs WHERE is_active = 1 AND access_token IS NOT NULL AND access_token <> '' ORDER BY id DESC LIMIT 1"
        );
    } catch (e) {
        const code = String((e && e.code) || '');
        if (code === 'ER_BAD_FIELD_ERROR') {
            [rows] = await pool.query(
                "SELECT access_token FROM meta_ads_configs WHERE access_token IS NOT NULL AND access_token <> '' ORDER BY id DESC LIMIT 1"
            );
        } else {
            throw e;
        }
    }
    return rows.length > 0 ? rows[0].access_token : null;
}

function parseDurationDays(raw) {
    const s = String(raw || '').trim();
    if (!s) return 30;
    const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 30;
}

function getInitialWaitingStatusByMonth(refDate = new Date()) {
    try {
        const d = new Date(refDate);
        // Bulan Mei = 4 (0-indexed)
        return d.getMonth() === 4 ? 'Menunggu OTP' : 'Menunggu';
    } catch (_) {
        return 'Menunggu';
    }
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

async function resolveCommissionAmount(connection, packageId, roleName, preferredContentType) {
    let amount = 0;
    const preferred = String(preferredContentType || '').toLowerCase() || 'general';
    const role = String(roleName || '');
    if (!packageId || !role) return amount;
    const [specific] = await connection.query(
        'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ? LIMIT 1',
        [packageId, role, preferred]
    );
    if (specific.length && specific[0].amount != null) return Number(specific[0].amount);
    const [general] = await connection.query(
        'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? AND content_type = ? LIMIT 1',
        [packageId, role, 'general']
    );
    if (general.length && general[0].amount != null) return Number(general[0].amount);
    const [any] = await connection.query(
        'SELECT amount FROM commission_rules WHERE package_id = ? AND role = ? LIMIT 1',
        [packageId, role]
    );
    if (any.length && any[0].amount != null) return Number(any[0].amount);
    return amount;
}

async function getMappedEditorIdForCs(connection, csUserId) {
    const csId = Number(csUserId || 0);
    if (!csId) return null;
    await ensureCsEditorAssignmentsTable();
    const [rows] = await connection.query(
        'SELECT editor_user_id FROM cs_editor_assignments WHERE cs_user_id = ? LIMIT 1',
        [csId]
    );
    if (!rows.length) return null;
    const editorId = Number(rows[0].editor_user_id || 0);
    return editorId || null;
}

async function upsertMappedEditorAssignmentForOrder(connection, { orderId, packageId, orderStatus, csUserId }) {
    const csId = Number(csUserId || 0);
    const oid = Number(orderId || 0);
    if (!csId || !oid) return null;
    const editorId = await getMappedEditorIdForCs(connection, csId);
    if (!editorId) return null;
    const contentType = String(orderStatus || '').toLowerCase() === 'perpanjang' ? 'extend' : 'general';
    const amount = await resolveCommissionAmount(connection, packageId, 'Editor', contentType);
    const [existing] = await connection.query(
        'SELECT id FROM order_assignments WHERE order_id = ? AND role = "Editor" LIMIT 1',
        [oid]
    );
    if (existing.length > 0) {
        await connection.query(
            'UPDATE order_assignments SET user_id = ?, content_type = ?, commission_amount = ? WHERE id = ?',
            [editorId, contentType, amount, existing[0].id]
        );
    } else {
        await connection.query(
            'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "Editor", ?, ?)',
            [oid, editorId, contentType, amount]
        );
    }
    return editorId;
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
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN source_event_key VARCHAR(191) NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN ref_txn_id INT NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN posted_at DATETIME NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending'`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN approved_by INT NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN approved_at DATETIME NULL`);
        await tryAdd(`ALTER TABLE commission_ledger ADD COLUMN approval_note TEXT NULL`);
        try {
            await p.query(`ALTER TABLE commission_ledger ADD INDEX idx_commission_approval_status (approval_status)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_KEYNAME' && code !== 'ER_NO_SUCH_TABLE') throw e;
        }
        try {
            await p.query(`ALTER TABLE commission_ledger ADD UNIQUE KEY uniq_commission_source_event_key (source_event_key)`);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code !== 'ER_DUP_KEYNAME' && code !== 'ER_DUP_ENTRY' && code !== 'ER_NO_SUCH_TABLE') throw e;
        }

        console.log('Commission ledger schema ready');
    } catch (e) {
        console.error('Error ensuring commission ledger schema:', e);
    }
}

async function ensureOrderContentsWorkflowSchema() {
    try {
        const p = await getPool();
        const tryAdd = async (sql) => {
            try {
                await p.query(sql);
            } catch (e) {
                const code = String((e && e.code) || '');
                if (code === 'ER_DUP_FIELDNAME' || code === 'ER_NO_SUCH_TABLE') return;
                throw e;
            }
        };
        await tryAdd(`ALTER TABLE order_contents ADD COLUMN repair_issue TEXT NULL`);
        await tryAdd(`ALTER TABLE order_contents ADD COLUMN repair_fix TEXT NULL`);
        await tryAdd(`ALTER TABLE order_contents ADD COLUMN repair_user_id INT NULL`);
        console.log('Order contents workflow schema ready');
    } catch (e) {
        console.error('Error ensuring order_contents workflow schema:', e);
    }
}

async function ensureOrderRepairHistorySchema() {
    try {
        const p = await getPool();
        await p.query(`
            CREATE TABLE IF NOT EXISTS order_repair_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                repair_no INT NOT NULL,
                repair_issue TEXT NOT NULL,
                repair_fix TEXT NOT NULL,
                user_id INT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_order_repair_no (order_id, repair_no),
                KEY idx_order_repair_logs_order (order_id),
                KEY idx_order_repair_logs_user (user_id)
            )
        `);
        console.log('Order repair history schema ready');
    } catch (e) {
        console.error('Error ensuring order_repair_logs schema:', e);
    }
}

async function accrueCommissionLedger(input = {}, conn = null) {
    const db = conn || pool;
    const orderId = Number(input.order_id || input.orderId || 0);
    const userId = Number(input.user_id || input.userId || 0);
    const role = String(input.role || '');
    const contentType = String(input.content_type || input.contentType || 'general');
    const basisAmount = input.basis_amount != null ? Number(input.basis_amount) : null;
    const rateType = String(input.rate_type || input.rateType || 'flat');
    const rateValue = input.rate_value != null ? Number(input.rate_value) : Number(input.amount || 0);
    const amount = Number(input.amount || 0);
    const sourceEvent = String(input.source_event || input.sourceEvent || 'manual');
    const sourceEventKey = String(
        input.source_event_key ||
        input.sourceEventKey ||
        `${sourceEvent}:${orderId}:${userId}:${role}:${contentType}`
    );
    const status = String(input.status || 'accrued');

    if (!orderId || !userId || !role) return { success: false, skipped: true, reason: 'invalid_input' };
    await ensureCommissionLedgerSchema();

    try {
        const [dup] = await db.query(
            'SELECT id FROM commission_ledger WHERE source_event_key = ? LIMIT 1',
            [sourceEventKey]
        );
        if (dup.length > 0) return { success: true, duplicate: true, id: dup[0].id };
    } catch (e) {
        const code = String((e && e.code) || '');
        if (code !== 'ER_BAD_FIELD_ERROR') throw e;
        const [dupLegacy] = await db.query(
            'SELECT id FROM commission_ledger WHERE order_id = ? AND user_id = ? AND role = ? AND source_event = ? LIMIT 1',
            [orderId, userId, role, sourceEvent]
        );
        if (dupLegacy.length > 0) return { success: true, duplicate: true, id: dupLegacy[0].id };
    }

    const [res] = await db.query(
        `INSERT INTO commission_ledger
         (order_id, user_id, role, content_type, basis_amount, rate_type, rate_value, amount, status, source_event, source_event_key, approval_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [orderId, userId, role, contentType, basisAmount, rateType, rateValue, amount, status, sourceEvent, sourceEventKey]
    );
    return { success: true, duplicate: false, id: res.insertId };
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
ensureTransactionsCategoryColumn();
ensureOrdersExtraColumns();
ensureOrdersRenewalColumns();
ensureOrdersTimingColumns();
ensureMetaAdsConfigSchema();
ensureCampaignsSchema();
ensureCommissionLedgerSchema();
ensureOrderContentsWorkflowSchema();
ensureOrderRepairHistorySchema();
ensureCsEditorAssignmentsTable();
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
            SELECT COALESCE(SUM(cl.amount), 0) as total
            FROM commission_ledger cl
            WHERE cl.user_id = ? AND cl.role = 'CS' AND cl.source_event = 'order_lunas'
              AND MONTH(cl.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(cl.created_at) = YEAR(CURRENT_DATE())
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
                SELECT COALESCE(SUM(cl.amount), 0) as total
                FROM commission_ledger cl
                WHERE cl.user_id = ? AND cl.role = 'CS' AND cl.source_event = 'order_lunas'
                  AND MONTH(cl.created_at) = MONTH(CURRENT_DATE())
                  AND YEAR(cl.created_at) = YEAR(CURRENT_DATE())
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
        else if (role === 'Team Bengkel' || role === 'Bengkel') {
             const [tasks] = await pool.query(`
                SELECT COUNT(DISTINCT oc.order_id) as count
                FROM order_contents oc
                WHERE LOWER(oc.status) LIKE '%iklan tayang%'
             `);
             const [completed] = await pool.query(`
                SELECT COUNT(DISTINCT oc.order_id) as count
                FROM order_contents oc
                WHERE LOWER(oc.status) LIKE '%sudah diperbaiki%'
             `);
             let commissionTotal = 0;
             if (userId) {
                const [comm] = await pool.query(`
                    SELECT COALESCE(SUM(cl.amount), 0) as total
                    FROM commission_ledger cl
                    WHERE cl.user_id = ? AND cl.role = 'Team Bengkel' AND cl.source_event = 'bengkel_done'
                 `, [userId]);
                commissionTotal = comm[0].total || 0;
             }
             stats.pendingTasks = tasks[0].count || 0;
             stats.completedTasks = completed[0].count || 0;
             stats.commissionThisMonth = commissionTotal;
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
            SELECT COUNT(DISTINCT oc.order_id) as count
            FROM order_contents oc
            JOIN order_assignments oa ON oa.order_id = oc.order_id AND oa.role = 'CRM' AND oa.user_id = ?
            WHERE LOWER(oc.status) = 'otp selesai'
              AND MONTH(COALESCE(oc.updated_at, oc.created_at)) = MONTH(CURRENT_DATE())
              AND YEAR(COALESCE(oc.updated_at, oc.created_at)) = YEAR(CURRENT_DATE())
        `, [userId]);
        const [commTotal] = await pool.query(`
            SELECT COALESCE(SUM(cl.amount), 0) as total
            FROM commission_ledger cl
            WHERE cl.user_id = ? AND cl.role = 'CRM' AND cl.source_event = 'otp_selesai'
              AND MONTH(cl.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(cl.created_at) = YEAR(CURRENT_DATE())
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
            commissionThisMonth: commTotal[0].total || 0,
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
            const code = String((e && e.code) || '');
            if (code === 'ER_BAD_FIELD_ERROR') {
                try {
                    const fallbackSql1 = sql.replace(', phone', '');
                    const [users1] = await pool.query(fallbackSql1, params);
                    return res.json(users1);
                } catch (e2) {
                    const code2 = String((e2 && e2.code) || '');
                    if (code2 !== 'ER_BAD_FIELD_ERROR') throw e2;
                    try {
                        const fallbackSql2 = sql.replace(', phone', '').replace(', created_at', '');
                        const [users2] = await pool.query(fallbackSql2, params);
                        return res.json(users2);
                    } catch (e3) {
                        const code3 = String((e3 && e3.code) || '');
                        if (code3 !== 'ER_BAD_FIELD_ERROR') throw e3;
                        const fallbackSql3 = 'SELECT id, name, email, role FROM users' + (qRole ? ' WHERE LOWER(role) = LOWER(?)' : '');
                        const [users3] = await pool.query(fallbackSql3, params);
                        return res.json(users3);
                    }
                }
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

app.get('/api/editor-assignments', async (req, res) => {
    try {
        await ensureCsEditorAssignmentsTable();
        const [rows] = await pool.query(
            `SELECT cea.cs_user_id,
                    cea.editor_user_id,
                    cea.updated_at,
                    cs.name AS cs_name,
                    cs.email AS cs_email,
                    ed.name AS editor_name,
                    ed.email AS editor_email
             FROM cs_editor_assignments cea
             LEFT JOIN users cs ON cs.id = cea.cs_user_id
             LEFT JOIN users ed ON ed.id = cea.editor_user_id
             ORDER BY cs.name ASC, cea.updated_at DESC`
        );
        res.json(rows);
    } catch (e) {
        console.error('Editor assignments list error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/editor-assignments', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const csUserId = Number(req.body && (req.body.cs_user_id || req.body.csUserId || 0));
        const editorUserId = Number(req.body && (req.body.editor_user_id || req.body.editorUserId || 0));
        if (!csUserId || !editorUserId) {
            return res.status(400).json({ error: 'cs_user_id dan editor_user_id wajib diisi' });
        }
        await ensureCsEditorAssignmentsTable();

        const [csRows] = await connection.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [csUserId]);
        if (!csRows.length || String(csRows[0].role || '').toLowerCase() !== 'cs') {
            return res.status(400).json({ error: 'User CS tidak valid' });
        }
        const [editorRows] = await connection.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [editorUserId]);
        if (!editorRows.length || !String(editorRows[0].role || '').toLowerCase().includes('editor')) {
            return res.status(400).json({ error: 'User Editor tidak valid' });
        }

        await connection.beginTransaction();
        await connection.query(
            `INSERT INTO cs_editor_assignments (cs_user_id, editor_user_id)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE editor_user_id = VALUES(editor_user_id), updated_at = CURRENT_TIMESTAMP`,
            [csUserId, editorUserId]
        );

        // Sinkronkan assignment editor existing untuk semua order milik CS ini,
        // agar dashboard editor lama tidak lagi menampilkan task tersebut.
        const [syncResult] = await connection.query(
            `UPDATE order_assignments oa_editor
             JOIN order_assignments oa_cs
               ON oa_cs.order_id = oa_editor.order_id
              AND oa_cs.role = 'CS'
             SET oa_editor.user_id = ?
             WHERE oa_cs.user_id = ?
               AND oa_editor.role LIKE '%Editor%'`,
            [editorUserId, csUserId]
        );

        await connection.commit();
        res.json({ success: true, synced_editor_assignments: syncResult.affectedRows || 0 });
    } catch (e) {
        try { await connection.rollback(); } catch (_) {}
        console.error('Editor assignment upsert error:', e);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

app.delete('/api/editor-assignments/:csUserId', async (req, res) => {
    try {
        const csUserId = Number(req.params && req.params.csUserId);
        if (!csUserId) return res.status(400).json({ error: 'csUserId tidak valid' });
        await ensureCsEditorAssignmentsTable();
        await pool.query('DELETE FROM cs_editor_assignments WHERE cs_user_id = ?', [csUserId]);
        res.json({ success: true });
    } catch (e) {
        console.error('Editor assignment delete error:', e);
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
        await ensureCampaignsSchema();
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

        const token = await getMetaAccessToken();
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
                await accrueCommissionLedger({
                    order_id,
                    user_id: advUserId,
                    role: 'Advertiser',
                    content_type: 'campaign',
                    basis_amount: null,
                    rate_type: 'flat',
                    rate_value: amount,
                    amount,
                    status: 'accrued',
                    source_event: 'campaign_created',
                    source_event_key: `campaign_created:${order_id}:${advUserId}:campaign`
                });
            }
        } catch (e) {
            console.error('Advertiser commission on campaign create error:', e);
        }

        res.json({ success: true, campaign_id: campaignId, created_on_meta: true });
    } catch (e) {
        console.error('Campaign create error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Internal server error' });
    }
});

// Duplicate campaign flow aligned with Apps Script duplicateCampaignFullManual
app.post('/api/campaigns/duplicate', async (req, res) => {
    try {
        await ensureCampaignsSchema();
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

        const token = await getMetaAccessToken();
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
                await accrueCommissionLedger({
                    order_id,
                    user_id: advUserId,
                    role: 'Advertiser',
                    content_type: 'campaign',
                    basis_amount: null,
                    rate_type: 'flat',
                    rate_value: amount,
                    amount,
                    status: 'accrued',
                    source_event: 'campaign_created',
                    source_event_key: `campaign_created:${order_id}:${advUserId}:campaign`
                });
            }
        } catch (e) {
            console.error('Advertiser commission on campaign duplicate error:', e);
        }

        res.json({ success: true, campaign_id: newCampaignId, adsets: createdAdsets });
    } catch (e) {
        console.error('Duplicate campaign error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Internal server error' });
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
        const [orders] = await pool.query('SELECT status, client_id, created_at FROM orders WHERE id = ?', [id]);
        if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });
        const order = orders[0];
        const typeRaw = (order.status || '').toLowerCase();
        const type = (typeRaw === 'perpanjang' || typeRaw === 'extend' || typeRaw === 'repeat') ? 'Perpanjang' : 'Baru';
        // Content process
        const [contents] = await pool.query('SELECT status FROM order_contents WHERE order_id = ? LIMIT 1', [id]);
        let process = 'Menunggu';
        if (contents.length > 0 && contents[0].status) {
            const cs = (contents[0].status || '').toLowerCase();
            const orderCreated = order && order.created_at ? new Date(order.created_at) : null;
            const isMayOrder = orderCreated && !isNaN(orderCreated.getTime()) && orderCreated.getMonth() === 4;
            if (cs === 'menunggu') process = isMayOrder ? 'Menunggu OTP' : 'Menunggu';
            else if (cs === 'menunggu otp' || cs.includes('menunggu otp')) process = 'Menunggu OTP';
            else if (cs.includes('mulai konten')) process = 'Mulai Konten';
            else if (cs.includes('proses konten')) process = 'Proses Konten';
            else if (cs.includes('siap iklan')) process = 'Siap Iklan';
            else if (cs.includes('iklan tayang')) process = 'Iklan Tayang';
            else if (cs.includes('sudah diperbaiki')) process = 'Sudah Diperbaiki';
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
        } else if (process === 'Sudah Diperbaiki' || process === 'Iklan Tayang') {
            ad = 'Aktif';
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
        const [otpSelesai] = await pool.query(`
            SELECT COUNT(DISTINCT oc.order_id) as count
            FROM order_contents oc
            WHERE LOWER(oc.status) = 'otp selesai'
        `);
        const [ready] = await pool.query(`
            SELECT COUNT(DISTINCT oc.order_id) as count
            FROM order_contents oc
            WHERE LOWER(oc.status) = 'siap iklan'
        `);
        const [commissionReady] = await pool.query(`
            SELECT COALESCE(SUM(cl.amount), 0) as total
            FROM commission_ledger cl
            WHERE cl.user_id = ? AND cl.role = 'Editor' AND cl.source_event = 'content_ready'
        `, [userId]);
        const [contentMonth] = await pool.query(`
            SELECT COUNT(DISTINCT oc.id) as count
            FROM order_contents oc
            JOIN order_assignments oa ON oa.order_id = oc.order_id AND oa.role = 'Editor' AND oa.user_id = ?
            WHERE MONTH(oc.created_at) = MONTH(CURRENT_DATE())
              AND YEAR(oc.created_at) = YEAR(CURRENT_DATE())
        `, [userId]);
        res.json({
            otpSelesaiClients: otpSelesai[0].count || 0,
            readyClients: ready[0].count || 0,
            editorCommissionReadyTotal: commissionReady[0].total || 0,
            contentCreatedThisMonth: contentMonth[0].count || 0
        });
    } catch (e) {
        console.error('Editor stats error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/dashboard/advertiser-stats', async (req, res) => {
  try {
    const [ready] = await pool.query(`
        SELECT COUNT(DISTINCT o.id) as count
        FROM orders o
        JOIN order_contents oc ON oc.order_id = o.id
        WHERE LOWER(oc.status) = 'siap iklan'
    `);
    const [tayang] = await pool.query(`
        SELECT COUNT(DISTINCT o.id) as count
        FROM orders o
        JOIN order_contents oc ON oc.order_id = o.id
        WHERE LOWER(oc.status) = 'iklan tayang'
    `);
    const [commission] = await pool.query(`
        SELECT COALESCE(SUM(oa.commission_amount), 0) as total
        FROM order_assignments oa
        JOIN order_contents oc ON oc.order_id = oa.order_id
        WHERE oa.role = 'Advertiser'
          AND LOWER(oc.status) = 'iklan tayang'
    `);
    res.json({
      readyClients: ready[0].count || 0,
      tayangClients: tayang[0].count || 0,
      advertiserCommissionTayangTotal: commission[0].total || 0
    });
  } catch (e) {
    console.error('Advertiser stats error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Meta Ads basic config (stub for UI dropdowns)
app.get('/api/meta-config', async (_req, res) => {
    try {
        await ensureMetaAdsConfigSchema();
        const [accounts] = await pool.query('SELECT account_id as id, name FROM ad_accounts ORDER BY name ASC');
        const [fanspages] = await pool.query('SELECT fanspage_id as id, name FROM fanspages ORDER BY name ASC');
        let pixel_id = '';
        let access_token = '';
        const [cfg] = await pool.query('SELECT pixel_id, access_token FROM meta_ads_configs ORDER BY id DESC LIMIT 1');
        if (cfg.length > 0 && cfg[0].pixel_id) {
            pixel_id = cfg[0].pixel_id;
        }
        if (cfg.length > 0 && cfg[0].access_token) {
            access_token = cfg[0].access_token;
        }

        res.json({
            accounts,
            fanspages,
            pixel_id,
            access_token
        });
    } catch (e) {
        console.error('Meta config fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/meta-config', async (req, res) => {
    try {
        const { accounts, pixel_id, access_token } = req.body;
        await ensureMetaAdsConfigSchema();
        
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
            if (access_token !== undefined) {
                let configId = 1;
                const [configs] = await connection.query('SELECT id FROM meta_ads_configs ORDER BY id DESC LIMIT 1');
                if (configs.length > 0) {
                    configId = configs[0].id;
                } else {
                    const [resCreate] = await connection.query("INSERT INTO meta_ads_configs (name) VALUES ('Default')");
                    configId = resCreate.insertId;
                }
                await connection.query('UPDATE meta_ads_configs SET access_token = ? WHERE id = ?', [String(access_token || '').trim(), configId]);
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
        const roleFilter = String(role || '').toLowerCase();

        let query = `
            SELECT o.*, c.name as client_name, c.business_name, c.whatsapp as client_whatsapp,
                   p.name as package_name, p.price as package_price,
                   csu.name as cs_name, csu.email as cs_email, csu.phone as cs_phone,
                   (
                       SELECT oc1.status
                       FROM order_contents oc1
                       WHERE oc1.order_id = o.id
                       ORDER BY COALESCE(oc1.updated_at, oc1.created_at) DESC, oc1.id DESC
                       LIMIT 1
                   ) as content_status,
                   (
                       SELECT oc1.repair_issue
                       FROM order_contents oc1
                       WHERE oc1.order_id = o.id
                       ORDER BY COALESCE(oc1.updated_at, oc1.created_at) DESC, oc1.id DESC
                       LIMIT 1
                   ) as repair_issue,
                   (
                       SELECT oc1.repair_fix
                       FROM order_contents oc1
                       WHERE oc1.order_id = o.id
                       ORDER BY COALESCE(oc1.updated_at, oc1.created_at) DESC, oc1.id DESC
                       LIMIT 1
                   ) as repair_fix,
                   (
                       SELECT COUNT(*)
                       FROM order_repair_logs rl
                       WHERE rl.order_id = o.id
                   ) as repair_count
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
            LEFT JOIN (
                SELECT order_id, MAX(user_id) AS cs_user_id
                FROM order_assignments
                WHERE role = 'CS'
                GROUP BY order_id
            ) oa_cs ON oa_cs.order_id = o.id
            LEFT JOIN users csu ON csu.id = oa_cs.cs_user_id
        `;
        
        const params = [];
        let whereClauses = [];

        if (assigned_to && roleFilter) {
            query += ` JOIN order_assignments oa ON o.id = oa.order_id `;
            whereClauses.push(`oa.user_id = ?`);
            params.push(assigned_to);
            if (roleFilter === 'cs') whereClauses.push(`oa.role = 'CS'`);
            else if (roleFilter === 'advertiser') whereClauses.push(`oa.role = 'Advertiser'`);
            else if (roleFilter.includes('editor')) whereClauses.push(`oa.role LIKE '%Editor%'`);
            else if (roleFilter === 'team bengkel' || roleFilter === 'bengkel' || roleFilter === 'team_bengkel') whereClauses.push(`oa.role = 'Team Bengkel'`);
        }

        if (content_status) {
            query += ` JOIN order_contents oc ON oc.order_id = o.id `;
            const cs = String(content_status).toLowerCase();
            let target = '';
            if (cs === 'otp') target = 'Proses OTP';
            else if (cs === 'menunggu') target = 'Menunggu';
            else if (cs === 'menunggu_otp' || cs === 'waiting_otp') target = '__MENUNGGU_OTP_OR_LEGACY__';
            else if (cs === 'otp_selesai' || cs === 'otp-selesai') target = 'OTP Selesai';
            else if (cs === 'content' || cs === 'proses_konten') target = 'Proses Konten';
            else if (cs === 'ready' || cs === 'siap_iklan') target = 'Siap Iklan';
            else if (cs === 'iklan_tayang' || cs === 'tayang') target = 'Iklan Tayang';
            else if (cs === 'sudah_diperbaiki' || cs === 'done_bengkel') target = 'Sudah Diperbaiki';
            if (target) {
                if (target === '__MENUNGGU_OTP_OR_LEGACY__') {
                    whereClauses.push(`(LOWER(oc.status) LIKE LOWER(?) OR LOWER(oc.status) = 'menunggu')`);
                    params.push('%Menunggu OTP%');
                } else {
                    whereClauses.push(`LOWER(oc.status) LIKE LOWER(?)`);
                    params.push(`%${target}%`);
                }
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

        if (assigned_to && roleFilter) {
            countQuery += ` JOIN order_assignments oa ON o.id = oa.order_id `;
            countWhere.push(`oa.user_id = ?`);
            countParams.push(assigned_to);
             if (roleFilter === 'cs') countWhere.push(`oa.role = 'CS'`);
            else if (roleFilter === 'advertiser') countWhere.push(`oa.role = 'Advertiser'`);
            else if (roleFilter.includes('editor')) countWhere.push(`oa.role LIKE '%Editor%'`);
            else if (roleFilter === 'team bengkel' || roleFilter === 'bengkel' || roleFilter === 'team_bengkel') countWhere.push(`oa.role = 'Team Bengkel'`);
        }

        if (content_status) {
            countQuery += ` JOIN order_contents oc ON oc.order_id = o.id `;
            const cs = String(content_status).toLowerCase();
            let target = '';
            if (cs === 'otp') target = 'Proses OTP';
            else if (cs === 'menunggu') target = 'Menunggu';
            else if (cs === 'menunggu_otp' || cs === 'waiting_otp') target = '__MENUNGGU_OTP_OR_LEGACY__';
            else if (cs === 'otp_selesai' || cs === 'otp-selesai') target = 'OTP Selesai';
            else if (cs === 'content' || cs === 'proses_konten') target = 'Proses Konten';
            else if (cs === 'ready' || cs === 'siap_iklan') target = 'Siap Iklan';
            else if (cs === 'iklan_tayang' || cs === 'tayang') target = 'Iklan Tayang';
            else if (cs === 'sudah_diperbaiki' || cs === 'done_bengkel') target = 'Sudah Diperbaiki';
            if (target) {
                if (target === '__MENUNGGU_OTP_OR_LEGACY__') {
                    countWhere.push(`(LOWER(oc.status) LIKE LOWER(?) OR LOWER(oc.status) = 'menunggu')`);
                    countParams.push('%Menunggu OTP%');
                } else {
                    countWhere.push(`LOWER(oc.status) LIKE LOWER(?)`);
                    countParams.push(`%${target}%`);
                }
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

app.get('/api/orders/crm-data', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;

        const baseWhere = `
            WHERE o.created_at < DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
              AND COALESCE(o.repeat_order, 0) = 0
              AND LOWER(COALESCE(o.status, '')) NOT IN ('perpanjang', 'extend', 'repeat')
              AND NOT EXISTS (
                    SELECT 1
                    FROM orders o2
                    WHERE o2.parent_order_id = o.id
              )
        `;

        let query = `
            SELECT o.*, c.name as client_name, c.business_name, c.whatsapp as client_whatsapp,
                   p.name as package_name, p.price as package_price,
                   csu.name as cs_name, csu.email as cs_email, csu.phone as cs_phone
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN packages p ON o.package_id = p.id
            LEFT JOIN (
                SELECT order_id, MAX(user_id) AS cs_user_id
                FROM order_assignments
                WHERE role = 'CS'
                GROUP BY order_id
            ) oa_cs ON oa_cs.order_id = o.id
            LEFT JOIN users csu ON csu.id = oa_cs.cs_user_id
            ${baseWhere}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `;

        let rows;
        try {
            [rows] = await pool.query(query, [limit, offset]);
        } catch (e) {
            const code = String((e && e.code) || '');
            if (code === 'ER_BAD_FIELD_ERROR' && query.includes('p.price as package_price')) {
                query = query.replace('p.price as package_price', 'p.price_monthly as package_price');
                [rows] = await pool.query(query, [limit, offset]);
            } else {
                throw e;
            }
        }

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total
             FROM orders o
             ${baseWhere}`
        );

        res.json({
            data: rows,
            meta: {
                page,
                limit,
                total: countRows[0].total,
                totalPages: Math.ceil(countRows[0].total / limit)
            }
        });
    } catch (e) {
        console.error('CRM data orders fetch error:', e);
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
        const paymentInputStatus = orderPayload.paymentStatus || orderPayload.payment_status || body.paymentStatus || body.payment_status;
        const paymentInputDpAmount = orderPayload.paymentDpAmount || orderPayload.payment_dp_amount || body.paymentDpAmount || body.payment_dp_amount;

        const startDate = orderPayload.startDate || orderPayload.start_date || (metaDataRaw && metaDataRaw.startDate) || null;
        const endDate = orderPayload.endDate || orderPayload.end_date || (metaDataRaw && metaDataRaw.endDate) || null;

        await ensureOrdersExtraColumns();
        await ensureOrdersTimingColumns();
        const paymentSummary = await buildOrderPaymentSummary(connection, packageId, paymentInputStatus, paymentInputDpAmount);
        await connection.beginTransaction();

        const startDateSource = startDate ? 'cs_estimate' : 'system';

        const [orderResult] = await connection.query(
            `INSERT INTO orders (client_id, package_id, status, repeat_order, start_date, end_date, service_type, meta_data, payment_status, payment_total_amount, payment_dp_amount, payment_remaining_amount, go_live_date, start_date_source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
            [clientId, packageId, status, repeatOrder, startDate, endDate, serviceType, metaData, paymentSummary.paymentStatus, paymentSummary.totalAmount, paymentSummary.dpAmount, paymentSummary.remainingAmount, startDateSource]
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
        let csAssigneeId = null;
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
            csAssigneeId = Number(csId || 0) || null;
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
                csAssigneeId = Number(creatorId || 0) || null;
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
                await accrueCommissionLedger({
                    order_id: orderId,
                    user_id: creatorId,
                    role: 'CRM',
                    content_type: ctype,
                    amount,
                    source_event: 'created_order_crm',
                    source_event_key: `created_order_crm:${orderId}:${creatorId}:CRM:${ctype}`
                }, connection);
            }
        }
        if (csAssigneeId) {
            await upsertMappedEditorAssignmentForOrder(connection, {
                orderId,
                packageId,
                orderStatus: status,
                csUserId: csAssigneeId
            });
        }
        await insertOrderPaymentTransaction(connection, {
            orderId,
            amount: paymentSummary.dpAmount,
            category: paymentSummary.paymentStatus === 'Lunas' ? 'Pembayaran Order (Pelunasan)' : 'Pembayaran Order (DP)'
        });
        if (paymentSummary.paymentStatus === 'Lunas') {
            await accrueCsCommissionOnOrderLunas(connection, orderId);
        }

        const initialStatus = (userRole === 'cs' || userRole === 'crm') ? getInitialWaitingStatusByMonth() : 'Proses OTP';
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
        const paymentInputStatus = orderPayload.paymentStatus || orderPayload.payment_status || body.paymentStatus || body.payment_status;
        const paymentInputDpAmount = orderPayload.paymentDpAmount || orderPayload.payment_dp_amount || body.paymentDpAmount || body.payment_dp_amount;
        const metaDataRaw = orderPayload.metaData ?? orderPayload.meta_data ?? baseMetaData ?? null;
        const createNewVideo = Boolean(orderPayload.createNewVideo ?? orderPayload.create_new_video ?? body.createNewVideo ?? body.create_new_video ?? false);
        const renewNoteRaw = orderPayload.renewNote ?? orderPayload.renew_note ?? body.renewNote ?? body.renew_note ?? '';
        const renewNote = String(renewNoteRaw || '').trim();
        let metaData = metaDataRaw && typeof metaDataRaw !== 'string' ? JSON.stringify(metaDataRaw) : metaDataRaw;
        if (createNewVideo || renewNote) {
            let metaObj = {};
            if (metaDataRaw && typeof metaDataRaw === 'object') {
                metaObj = { ...metaDataRaw };
            } else if (typeof metaDataRaw === 'string' && metaDataRaw.trim()) {
                try {
                    metaObj = JSON.parse(metaDataRaw);
                } catch (_) {
                    metaObj = { legacy_meta: metaDataRaw };
                }
            }
            const prevRenewal = (metaObj && typeof metaObj.renewal === 'object' && metaObj.renewal !== null) ? metaObj.renewal : {};
            metaObj.renewal = {
                ...prevRenewal,
                create_new_video: createNewVideo,
                note: renewNote || null,
                updated_at: new Date().toISOString()
            };
            metaData = JSON.stringify(metaObj);
        }

        const startDate = orderPayload.startDate || orderPayload.start_date || body.startDate || body.start_date || null;
        const endDate = orderPayload.endDate || orderPayload.end_date || body.endDate || body.end_date || null;
        const renewalCount = Number(baseOrder.renewal_count || 0) + 1;
        const paymentSummary = await buildOrderPaymentSummary(connection, packageId, paymentInputStatus, paymentInputDpAmount);

        await connection.beginTransaction();

        const startDateSource = startDate ? 'cs_estimate' : 'system';
        const [orderResult] = await connection.query(
            `INSERT INTO orders (client_id, package_id, status, repeat_order, start_date, end_date, service_type, meta_data, payment_status, payment_total_amount, payment_dp_amount, payment_remaining_amount, parent_order_id, renewal_count, go_live_date, start_date_source)
             VALUES (?, ?, 'Perpanjang', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
            [baseOrder.client_id, packageId, startDate, endDate, serviceType, metaData, paymentSummary.paymentStatus, paymentSummary.totalAmount, paymentSummary.dpAmount, paymentSummary.remainingAmount, baseOrder.id, renewalCount, startDateSource]
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
        const csAssignment = assignments.find((a) => String(a.role || '').toLowerCase() === 'cs');
        const mappedEditorId = csAssignment ? await getMappedEditorIdForCs(connection, csAssignment.user_id) : null;
        for (const a of assignments) {
            const roleName = String(a.role || '');
            const contentTypeRaw = String(a.content_type || '').toLowerCase();
            const ruleType = roleName === 'CS'
                ? 'extend'
                : (contentTypeRaw || 'general');
            const assignedUserId = (mappedEditorId && String(roleName).toLowerCase().includes('editor'))
                ? Number(mappedEditorId)
                : Number(a.user_id);

            const amount = await resolveCommissionAmount(connection, packageId, roleName, ruleType);

            await connection.query(
                `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                 VALUES (?, ?, ?, ?, ?)`,
                [newOrderId, assignedUserId, roleName, ruleType, amount]
            );

            if (roleName !== 'CS') {
                await accrueCommissionLedger({
                    order_id: newOrderId,
                    user_id: assignedUserId,
                    role: roleName,
                    content_type: ruleType,
                    amount,
                    source_event: 'renew_order',
                    source_event_key: `renew_order:${newOrderId}:${assignedUserId}:${roleName}:${ruleType}`
                }, connection);
            }
        }
        if (csAssignment && csAssignment.user_id) {
            await upsertMappedEditorAssignmentForOrder(connection, {
                orderId: newOrderId,
                packageId,
                orderStatus: 'Perpanjang',
                csUserId: csAssignment.user_id
            });
        }

        await insertOrderPaymentTransaction(connection, {
            orderId: newOrderId,
            amount: paymentSummary.dpAmount,
            category: paymentSummary.paymentStatus === 'Lunas' ? 'Pembayaran Order (Pelunasan)' : 'Pembayaran Order (DP)'
        });
        if (paymentSummary.paymentStatus === 'Lunas') {
            await accrueCsCommissionOnOrderLunas(connection, newOrderId);
        }

        const initialStatus = (userRole === 'cs' || userRole === 'crm') ? getInitialWaitingStatusByMonth() : 'Proses OTP';
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
        await accrueCommissionLedger({
            order_id,
            user_id,
            role,
            content_type: contentType,
            amount: ruleAmount,
            source_event: 'created_order',
            source_event_key: `created_order:${order_id}:${user_id}:${role}:${contentType}`
        });
        res.json({ success: true });
    } catch (e) {
        console.error('Accrue commission error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/commissions/ledger', async (req, res) => {
    try {
        const { order_id, user_id, status, approval_status } = req.query || {};
        let sql = `
            SELECT cl.*, u.name as user_name 
            FROM commission_ledger cl
            LEFT JOIN users u ON cl.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        if (order_id) { sql += ' AND cl.order_id = ?'; params.push(order_id); }
        if (user_id) { sql += ' AND cl.user_id = ?'; params.push(user_id); }
        if (status) { sql += ' AND cl.status = ?'; params.push(status); }
        if (approval_status) { sql += ' AND cl.approval_status = ?'; params.push(approval_status); }
        sql += ' ORDER BY cl.created_at DESC';
        const [ledger] = await pool.query(sql, params);

        // Hitung summary
        const [summaryRows] = await pool.query(`
            SELECT 
                SUM(CASE WHEN approval_status = 'pending' THEN amount ELSE 0 END) as pending,
                SUM(CASE WHEN approval_status = 'approved' THEN amount ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid
            FROM commission_ledger
        `);
        const summary = summaryRows[0];

        // Dapatkan approved items untuk payout
        const [approvedItems] = await pool.query(`
            SELECT cl.*, u.name as user_name 
            FROM commission_ledger cl
            LEFT JOIN users u ON cl.user_id = u.id
            WHERE cl.approval_status = 'approved' AND cl.status != 'paid'
            ORDER BY cl.created_at DESC
        `);

        res.json({
            ledger,
            summary,
            approved_items: approvedItems
        });
    } catch (e) {
        console.error('Fetch ledger error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/commissions/approvals', async (req, res) => {
    try {
        const status = String((req.query && req.query.status) || 'pending');
        const startDate = String((req.query && req.query.startDate) || '').trim();
        const endDate = String((req.query && req.query.endDate) || '').trim();
        let sql = `
            SELECT cl.*, u.name as user_name, o.client_id
            FROM commission_ledger cl
            LEFT JOIN users u ON cl.user_id = u.id
            LEFT JOIN orders o ON cl.order_id = o.id
            WHERE cl.status IN ('accrued','approved','rejected','paid')
        `;
        const params = [];
        if (startDate && endDate) {
            sql += ` AND DATE(cl.created_at) BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }
        if (status !== 'all') {
            const normalizedStatus = String(status || '').toLowerCase();
            if (normalizedStatus === 'paid') {
                sql += ` AND cl.status = 'paid'`;
            } else {
                sql += ' AND cl.approval_status = ?';
                params.push(normalizedStatus);
            }
        }
        sql += ' ORDER BY cl.created_at DESC';
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (e) {
        console.error('Commission approval list error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/commissions/:id/approve', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const body = req.body || {};
        const approverId = body.approver_id || body.user_id || null;
        const note = body.note || null;

        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT id, status, approval_status FROM commission_ledger WHERE id = ? LIMIT 1', [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Ledger not found' });
        }
        const it = rows[0];
        if (String(it.status || '').toLowerCase() === 'paid') {
            await connection.rollback();
            return res.status(400).json({ error: 'Komisi sudah paid' });
        }
        await connection.query(
            `UPDATE commission_ledger
             SET approval_status = 'approved',
                 status = IF(status = 'accrued', 'approved', status),
                 approved_by = ?,
                 approved_at = NOW(),
                 approval_note = ?
             WHERE id = ?`,
            [approverId, note, id]
        );
        await connection.commit();
        res.json({ success: true });
    } catch (e) {
        try { await connection.rollback(); } catch (_) {}
        console.error('Approve commission error:', e);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

app.post('/api/commissions/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};
        const note = body.note || null;
        const reviewerId = body.user_id || null;
        const [rows] = await pool.query('SELECT id, status FROM commission_ledger WHERE id = ? LIMIT 1', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Ledger not found' });
        }
        if (String(rows[0].status || '').toLowerCase() === 'paid') {
            return res.status(400).json({ error: 'Komisi sudah paid dan tidak bisa reject' });
        }
        await pool.query(
            `UPDATE commission_ledger
             SET approval_status = 'rejected',
                 status = 'rejected',
                 approved_by = ?,
                 approved_at = NOW(),
                 approval_note = ?
             WHERE id = ?`,
            [reviewerId, note, id]
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Reject commission error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.patch('/api/commissions/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const ledgerId = Number(id);
        if (!Number.isFinite(ledgerId) || ledgerId <= 0) {
            connection.release();
            return res.status(400).json({ error: 'Invalid id' });
        }

        const body = req.body || {};
        const amountRaw = body.amount;
        const approvalStatusRaw = body.approval_status ?? body.approvalStatus ?? body.status;
        const noteRaw = body.approval_note ?? body.approvalNote ?? body.note;
        const editorId = body.editor_id ?? body.editorId ?? body.user_id ?? body.userId ?? null;

        const hasAmount = amountRaw !== undefined;
        const hasApprovalStatus = approvalStatusRaw !== undefined;
        const hasNote = noteRaw !== undefined;
        if (!hasAmount && !hasApprovalStatus && !hasNote) {
            connection.release();
            return res.status(400).json({ error: 'No fields to update' });
        }

        let amount = null;
        if (hasAmount) {
            amount = Number(amountRaw);
            if (!Number.isFinite(amount) || amount < 0) {
                connection.release();
                return res.status(400).json({ error: 'Invalid amount' });
            }
        }

        let approvalStatus = null;
        if (hasApprovalStatus) {
            approvalStatus = String(approvalStatusRaw || '').trim().toLowerCase();
            if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
                connection.release();
                return res.status(400).json({ error: 'Invalid approval_status' });
            }
        }

        let approvalNote = null;
        if (hasNote) {
            approvalNote = noteRaw == null ? null : String(noteRaw);
            if (approvalNote != null && approvalNote.length > 1000) {
                connection.release();
                return res.status(400).json({ error: 'Catatan terlalu panjang' });
            }
        }

        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT id, amount, status, approval_status, approval_note, approved_by FROM commission_ledger WHERE id = ? LIMIT 1',
            [ledgerId]
        );
        if (rows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Ledger not found' });
        }

        const existing = rows[0];
        const existingRowStatus = String(existing.status || '').toLowerCase();
        if (existingRowStatus === 'paid') {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Komisi sudah paid dan tidak bisa diedit' });
        }

        const finalAmount = hasAmount ? amount : Number(existing.amount || 0);
        const finalApprovalStatus = hasApprovalStatus
            ? approvalStatus
            : String(existing.approval_status || 'pending').toLowerCase();
        const finalApprovalNote = hasNote ? approvalNote : (existing.approval_note ?? null);

        const finalStatus = finalApprovalStatus === 'approved'
            ? 'approved'
            : (finalApprovalStatus === 'rejected' ? 'rejected' : 'accrued');
        const finalApprovedBy = finalApprovalStatus === 'pending'
            ? null
            : (editorId != null ? editorId : (existing.approved_by ?? null));
        const finalApprovedAt = finalApprovalStatus === 'pending' ? null : new Date();

        await connection.query(
            `UPDATE commission_ledger
             SET amount = ?,
                 approval_status = ?,
                 status = ?,
                 approval_note = ?,
                 approved_by = ?,
                 approved_at = ?
             WHERE id = ?`,
            [finalAmount, finalApprovalStatus, finalStatus, finalApprovalNote, finalApprovedBy, finalApprovedAt, ledgerId]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (e) {
        try { await connection.rollback(); } catch (_) {}
        console.error('Edit commission error:', e);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

app.post('/api/commissions/payout', async (req, res) => {
    const connection = await pool.getConnection();
    // #region debug-point A:payout-init
    const _traceId = `payout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const _dbg = (() => {
        try {
            const fs = require('fs');
            const envPath = '.dbg/commission-payout-500.env';
            let url = 'http://127.0.0.1:7777/event';
            let sessionId = 'commission-payout-500';
            try {
                const c = fs.readFileSync(envPath, 'utf8');
                url = c.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || url;
                sessionId = c.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
            } catch (_) {}
            return (hypothesisId, msg, data) => {
                try {
                    const payload = JSON.stringify({
                        sessionId,
                        runId: 'pre-fix',
                        hypothesisId,
                        location: 'server.js:/api/commissions/payout',
                        traceId: _traceId,
                        msg: `[DEBUG] ${msg}`,
                        data: data || {},
                        ts: Date.now()
                    });
                    const u = new URL(url);
                    const client = u.protocol === 'https:' ? require('https') : require('http');
                    const req = client.request(
                        {
                            hostname: u.hostname,
                            port: u.port,
                            path: u.pathname,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(payload)
                            }
                        },
                        (resp) => {
                            resp.on('data', () => {});
                            resp.on('end', () => {});
                        }
                    );
                    req.on('error', () => {});
                    req.write(payload);
                    req.end();
                } catch (_) {}
            };
        } catch (_) {
            return () => {};
        }
    })();
    // #endregion
    try {
        let _step = 'parse-body';
        const body = req.body || {};
        const ledgerIdsRaw = Array.isArray(body.ledger_ids)
            ? body.ledger_ids
            : (Array.isArray(body.ledgerIds) ? body.ledgerIds : []);
        const ledgerIds = ledgerIdsRaw.map((v) => String(v || '').trim()).filter(Boolean);
        _dbg('A', 'request', { step: _step, ledgerIdsCount: ledgerIds.length, ledgerIds: ledgerIds.slice(0, 10) });

        const now = new Date();
        const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        _step = 'begin-transaction';
        await connection.beginTransaction();
        _dbg('B', 'beginTransaction ok', { step: _step });

        _step = 'ensure-payout-schema';
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS payout_batch (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  period_start DATE NOT NULL,
                  period_end DATE NOT NULL,
                  status VARCHAR(20) NOT NULL DEFAULT 'draft',
                  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                  posted_at DATETIME NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            await connection.query(`
                CREATE TABLE IF NOT EXISTS payout_batch_items (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  batch_id INT NOT NULL,
                  ledger_id INT NOT NULL,
                  amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE KEY uniq_payout_batch_ledger (batch_id, ledger_id),
                  KEY idx_payout_batch_items_ledger (ledger_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            _dbg('B', 'ensure payout tables ok', { step: _step });
        } catch (e) {
            _dbg('H1', 'ensure payout tables failed (will continue without batch)', {
                step: _step,
                message: e?.message,
                code: e?.code,
                sqlState: e?.sqlState,
                sqlMessage: e?.sqlMessage
            });
        }

        let selectSql = `
            SELECT id, order_id, amount
            FROM commission_ledger
            WHERE approval_status = 'approved'
              AND status != 'paid'
        `;
        const params = [];
        if (ledgerIds.length > 0) {
            selectSql += ` AND id IN (${ledgerIds.map(() => '?').join(',')})`;
            params.push(...ledgerIds);
        }
        selectSql += ' FOR UPDATE';
        _step = 'select-ledger';
        const [items] = await connection.query(selectSql, params);
        _dbg('C', 'selected ledger items', { step: _step, itemsCount: Array.isArray(items) ? items.length : null, sample: Array.isArray(items) ? items.slice(0, 5) : null });

        if (!items || items.length === 0) {
            _step = 'rollback-empty';
            await connection.rollback();
            _dbg('C', 'no items; rollback', { step: _step });
            return res.json({ success: true, count: 0, total_amount: 0 });
        }

        _step = 'insert-batch';
        let batchId = null;
        try {
            const [batchRes] = await connection.query(
                `
                INSERT INTO payout_batch (period_start, period_end, status, total_amount)
                VALUES (?, ?, 'draft', 0)
                `,
                [periodStart, periodStart]
            );
            batchId = batchRes.insertId;
            _dbg('D', 'batch inserted', { step: _step, batchId });
        } catch (e) {
            _dbg('H1', 'insert payout_batch failed (will continue without batch)', {
                step: _step,
                message: e?.message,
                code: e?.code,
                sqlState: e?.sqlState,
                sqlMessage: e?.sqlMessage
            });
        }

        let total = 0;
        for (const it of items) {
            _step = 'process-item';
            const amount = Number(it.amount || 0);
            total += amount;
            _dbg('E', 'item', { step: _step, ledgerId: it.id, orderId: it.order_id, amount });
            let txnRes;
            try {
                [txnRes] = await connection.query(
                    `
                    INSERT INTO transactions (order_id, type, amount, category, trx_date, created_at)
                    VALUES (?, 'commission_pay', ?, 'Komisi', CURDATE(), NOW())
                    `,
                    [it.order_id, amount]
                );
            } catch (_) {
                [txnRes] = await connection.query(
                    `
                    INSERT INTO transactions (order_id, type, amount)
                    VALUES (?, 'commission_pay', ?)
                    `,
                    [it.order_id, amount]
                );
            }
            const txnId = txnRes.insertId;
            _dbg('E', 'txn inserted', { step: _step, ledgerId: it.id, txnId });
            await connection.query(
                `
                UPDATE commission_ledger
                SET status = 'paid',
                    ref_txn_id = ?,
                    posted_at = NOW()
                WHERE id = ?
                `,
                [txnId, it.id]
            );
            _dbg('E', 'ledger updated to paid', { step: _step, ledgerId: it.id });
            if (batchId) {
                try {
                    await connection.query(
                        `
                        INSERT INTO payout_batch_items (batch_id, ledger_id, amount)
                        VALUES (?, ?, ?)
                        `,
                        [batchId, it.id, amount]
                    );
                    _dbg('E', 'batch item inserted', { step: _step, ledgerId: it.id, batchId });
                } catch (e) {
                    _dbg('H1', 'insert payout_batch_items failed (ignored)', {
                        step: _step,
                        batchId,
                        ledgerId: it.id,
                        message: e?.message,
                        code: e?.code,
                        sqlState: e?.sqlState,
                        sqlMessage: e?.sqlMessage
                    });
                }
            }
        }

        _step = 'finalize-batch';
        if (batchId) {
            try {
                await connection.query(
                    `UPDATE payout_batch SET total_amount = ?, status = 'posted', posted_at = NOW() WHERE id = ?`,
                    [total, batchId]
                );
            } catch (e) {
                _dbg('H1', 'update payout_batch failed (ignored)', {
                    step: _step,
                    batchId,
                    message: e?.message,
                    code: e?.code,
                    sqlState: e?.sqlState,
                    sqlMessage: e?.sqlMessage
                });
            }
        }
        _step = 'commit';
        await connection.commit();
        _dbg('D', 'commit ok', { step: _step, batchId, totalAmount: total, count: items.length });
        res.json({ success: true, batch_id: batchId, total_amount: total, count: items.length });
    } catch (e) {
        try { await connection.rollback(); } catch (_) {}
        _dbg('H1', 'error', {
            step: typeof _step === 'string' ? _step : 'unknown',
            message: e?.message,
            code: e?.code,
            errno: e?.errno,
            sqlState: e?.sqlState,
            sqlMessage: e?.sqlMessage,
            stack: e?.stack
        });
        console.error('Payout error:', e);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
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
            WHERE status = 'approved'
              AND approval_status = 'approved'
              AND DATE(created_at) BETWEEN ? AND ?
        `, [period_start, period_end]);
        let total = 0;
        for (const it of items) {
            const amount = Number(it.amount || 0);
            total += amount;
            const [txnRes] = await connection.query(`
                INSERT INTO transactions (order_id, type, amount)
                VALUES (?, 'commission_pay', ?)
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
        await ensureOrdersExtraColumns();
        const { id } = req.params;
        const body = req.body || {};
        const amount = Math.max(0, normalizeMoney(body.amount, 0));
        const trxDate = String(body.trx_date || body.trxDate || '').trim() || null;
        if (!id || !amount || amount <= 0) {
            return res.status(400).json({ error: 'amount is required and must be > 0' });
        }
        await connection.beginTransaction();
        const [orders] = await connection.query('SELECT id, package_id, status, payment_status, payment_total_amount, payment_dp_amount, payment_remaining_amount FROM orders WHERE id = ? LIMIT 1', [id]);
        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Order not found' });
        }
        const order = orders[0];
        const totalAmount = Number(order.payment_total_amount || 0) || await resolvePackagePrice(connection, order.package_id);
        const previousStatus = normalizePaymentStatus(order.payment_status, 'Lunas');
        const previousDp = Math.max(0, Number(order.payment_dp_amount || 0));
        const previousRemaining = Math.max(0, Number(order.payment_remaining_amount || 0));
        const baseRemaining = previousStatus === 'DP'
            ? (previousRemaining > 0 ? previousRemaining : Math.max(totalAmount - previousDp, 0))
            : 0;
        const nextRemaining = Math.max(baseRemaining - amount, 0);
        const nextDp = totalAmount > 0 ? Math.min(previousDp + amount, totalAmount) : (previousDp + amount);
        const nextStatus = nextRemaining <= 0 ? 'Lunas' : 'DP';

        await insertOrderPaymentTransaction(connection, {
            orderId: id,
            amount,
            category: nextStatus === 'Lunas' ? 'Pembayaran Order (Pelunasan)' : 'Pembayaran Order (DP)',
            trxDate
        });
        await connection.query(
            'UPDATE orders SET payment_status = ?, payment_total_amount = ?, payment_dp_amount = ?, payment_remaining_amount = ? WHERE id = ?',
            [nextStatus, totalAmount, nextDp, nextRemaining, id]
        );
        if (previousStatus !== 'Lunas' && nextStatus === 'Lunas') {
            await accrueCsCommissionOnOrderLunas(connection, Number(id));
        }
        await connection.commit();
        res.json({
            success: true,
            payment_status: nextStatus,
            payment_total_amount: totalAmount,
            payment_dp_amount: nextDp,
            payment_remaining_amount: nextRemaining
        });
    } catch (e) {
        try { await connection.rollback(); } catch(_) {}
        console.error('Payment endpoint error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Internal server error' });
    } finally {
        connection.release();
    }
});
app.post('/api/orders/:id/payment-status', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        // #region debug-point D:payment-status-entry
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"payment-save-noop",runId:"pre-fix",hypothesisId:"D",location:"server.js:/api/orders/:id/payment-status:entry",msg:"[DEBUG] payment status endpoint entered",data:{orderId:String((req&&req.params&&req.params.id)||""),body:req.body||{}},ts:Date.now()})}).catch(()=>{});
        // #endregion
        await ensureOrdersExtraColumns();
        const { id } = req.params;
        const body = req.body || {};
        const paymentStatus = normalizePaymentStatus(body.payment_status || body.paymentStatus || body.status || body.value, '');
        if (!paymentStatus) {
            return res.status(400).json({ error: 'Status pembayaran tidak valid' });
        }
        await connection.beginTransaction();
        const [orders] = await connection.query(
            'SELECT id, package_id, payment_status, payment_total_amount, payment_dp_amount, payment_remaining_amount FROM orders WHERE id = ? LIMIT 1',
            [id]
        );
        if (!orders.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Order tidak ditemukan' });
        }
        const order = orders[0];
        const totalAmount = Number(order.payment_total_amount || 0) || await resolvePackagePrice(connection, order.package_id);
        const previousStatus = normalizePaymentStatus(order.payment_status, 'Lunas');
        let dpAmount = Math.max(0, Number(order.payment_dp_amount || 0));
        let remainingAmount = Math.max(0, Number(order.payment_remaining_amount || 0));

        if (paymentStatus === 'Lunas') {
            const pelunasanAmount = remainingAmount > 0 ? remainingAmount : Math.max(totalAmount - dpAmount, 0);
            if (pelunasanAmount > 0) {
                await insertOrderPaymentTransaction(connection, {
                    orderId: id,
                    amount: pelunasanAmount,
                    category: 'Pembayaran Order (Pelunasan)'
                });
            }
            dpAmount = totalAmount > 0 ? totalAmount : (dpAmount + pelunasanAmount);
            remainingAmount = 0;
        } else {
            dpAmount = totalAmount > 0 ? Math.min(dpAmount, totalAmount) : dpAmount;
            remainingAmount = totalAmount > 0 ? Math.max(totalAmount - dpAmount, 0) : remainingAmount;
        }

        await connection.query(
            'UPDATE orders SET payment_status = ?, payment_total_amount = ?, payment_dp_amount = ?, payment_remaining_amount = ? WHERE id = ?',
            [paymentStatus, totalAmount, dpAmount, remainingAmount, id]
        );
        if (previousStatus !== 'Lunas' && paymentStatus === 'Lunas') {
            await accrueCsCommissionOnOrderLunas(connection, Number(id));
        }
        await connection.commit();
        // #region debug-point D:payment-status-success
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"payment-save-noop",runId:"pre-fix",hypothesisId:"D",location:"server.js:/api/orders/:id/payment-status:success",msg:"[DEBUG] payment status endpoint success",data:{orderId:String(id||""),paymentStatus,totalAmount,dpAmount,remainingAmount},ts:Date.now()})}).catch(()=>{});
        // #endregion
        res.json({
            success: true,
            payment_status: paymentStatus,
            payment_total_amount: totalAmount,
            payment_dp_amount: dpAmount,
            payment_remaining_amount: remainingAmount
        });
    } catch (e) {
        try { await connection.rollback(); } catch(_) {}
        // #region debug-point D:payment-status-catch
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"payment-save-noop",runId:"pre-fix",hypothesisId:"D",location:"server.js:/api/orders/:id/payment-status:catch",msg:"[DEBUG] payment status endpoint failed",data:{message:String(e&&e.message||e)},ts:Date.now()})}).catch(()=>{});
        // #endregion
        console.error('Update payment status error:', e);
        res.status(500).json({ error: 'Internal server error' });
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
                    await accrueCommissionLedger({
                        order_id: id,
                        user_id: crmUserId,
                        role: 'CRM',
                        content_type: 'otp',
                        amount,
                        source_event: 'otp_to_content',
                        source_event_key: `otp_to_content:${id}:${crmUserId}:CRM:otp`
                    });
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
                    await accrueCommissionLedger({
                        order_id: id,
                        user_id: crmUserId,
                        role: 'CRM',
                        content_type: 'otp',
                        amount,
                        source_event: 'otp_sent',
                        source_event_key: `otp_sent:${id}:${crmUserId}:CRM:otp`
                    });
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

app.post('/api/orders/:id/content/status', async (req, res) => {
    try {
        await ensureOrdersExtraColumns();
        const { id } = req.params;
        const body = req.body || {};
        const nextStatusInput = String(body.status || '').trim();
        const nextStatusKey = nextStatusInput.toLowerCase();
        const allowedStatuses = new Map([
            ['menunggu', 'Menunggu'],
            ['menunggu otp', 'Menunggu OTP'],
            ['proses otp', 'Proses OTP'],
            ['otp diterima', 'OTP Diterima'],
            ['otp selesai', 'OTP Selesai'],
            ['proses crm', 'Proses CRM'],
            ['pending klien', 'Pending Klien'],
            ['no response', 'No Response'],
            ['proses konten', 'Proses Konten'],
            ['siap iklan', 'Siap Iklan'],
            ['iklan tayang', 'Iklan Tayang'],
            ['sudah diperbaiki', 'Sudah Diperbaiki']
        ]);
        const nextStatus = allowedStatuses.get(nextStatusKey) || '';

        if (!nextStatus) {
            return res.status(400).json({ error: 'Status tidak valid' });
        }

        if (nextStatus === 'Iklan Tayang') {
            const [orderRows] = await pool.query(
                'SELECT payment_status FROM orders WHERE id = ? LIMIT 1',
                [id]
            );
            if (!orderRows.length) {
                return res.status(404).json({ error: 'Order tidak ditemukan' });
            }
            const paymentStatus = normalizePaymentStatus(orderRows[0].payment_status, 'Lunas');
            if (paymentStatus !== 'Lunas') {
                return res.status(400).json({ error: 'Order belum lunas. Status Iklan Tayang hanya boleh untuk pembayaran lunas.' });
            }
        }

        const [existing] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
        if (existing.length > 0) {
            try {
                await pool.query('UPDATE order_contents SET status = ?, updated_at = NOW() WHERE order_id = ?', [nextStatus, id]);
            } catch (e) {
                const code = String((e && e.code) || '');
                if (code !== 'ER_BAD_FIELD_ERROR') throw e;
                await pool.query('UPDATE order_contents SET status = ? WHERE order_id = ?', [nextStatus, id]);
            }
        } else {
            await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, ?)', [id, nextStatus]);
        }

        if (nextStatus === 'OTP Selesai') {
            try {
                const crmUserIdRaw = body.userId || body.user_id;
                let crmUserId = crmUserIdRaw ? parseInt(crmUserIdRaw) : null;
                if (!crmUserId) {
                    const [crmAssign] = await pool.query('SELECT user_id FROM order_assignments WHERE order_id = ? AND role = "CRM" LIMIT 1', [id]);
                    if (crmAssign.length > 0) crmUserId = crmAssign[0].user_id;
                }
                if (crmUserId) {
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
                    try {
                        await pool.query(
                            'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "CRM", "otp", ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)',
                            [id, crmUserId, amount]
                        );
                    } catch (e) {
                        const code = String((e && e.code) || '');
                        if (code !== 'ER_DUP_ENTRY' && code !== 'ER_PARSE_ERROR') throw e;
                        const [existingAssign] = await pool.query(
                            'SELECT id FROM order_assignments WHERE order_id = ? AND role = "CRM" AND content_type = "otp" LIMIT 1',
                            [id]
                        );
                        if (existingAssign.length > 0) {
                            await pool.query(
                                'UPDATE order_assignments SET user_id = ?, commission_amount = ? WHERE id = ?',
                                [crmUserId, amount, existingAssign[0].id]
                            );
                        } else {
                            await pool.query(
                                'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "CRM", "otp", ?)',
                                [id, crmUserId, amount]
                            );
                        }
                    }
                    await accrueCommissionLedger({
                        order_id: id,
                        user_id: crmUserId,
                        role: 'CRM',
                        content_type: 'otp',
                        amount,
                        source_event: 'otp_selesai',
                        source_event_key: `otp_selesai:${id}:${crmUserId}:CRM:otp`
                    });
                }
            } catch (e) {
                console.error('CRM commission on OTP Selesai error:', e);
            }
        }

        res.json({ success: true, status: nextStatus });
    } catch (e) {
        console.error('Set content status error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/content/ready', async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};
        const editorUserIdRaw = body.userId || body.user_id;
        const editorUserRole = String(body.userRole || body.user_role || '').toLowerCase();
        const [existing] = await pool.query('SELECT id FROM order_contents WHERE order_id = ?', [id]);
        if (existing.length > 0) {
            try {
                await pool.query('UPDATE order_contents SET status = "Siap Iklan", updated_at = NOW() WHERE order_id = ?', [id]);
            } catch (e) {
                const code = String((e && e.code) || '');
                if (code !== 'ER_BAD_FIELD_ERROR') throw e;
                await pool.query('UPDATE order_contents SET status = "Siap Iklan" WHERE order_id = ?', [id]);
            }
        } else {
            await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Siap Iklan")', [id]);
        }

        try {
            const orderId = Number(id);
            const [ord] = await pool.query('SELECT package_id, status FROM orders WHERE id = ? LIMIT 1', [orderId]);
            if (ord.length > 0) {
                const packageId = ord[0].package_id || null;
                const orderStatus = String(ord[0].status || '');
                let editorUserId = editorUserIdRaw ? Number(editorUserIdRaw) : null;
                let amount = 0;
                let contentType = String(orderStatus || '').toLowerCase() === 'perpanjang' ? 'extend' : 'general';

                if (editorUserId && editorUserRole === 'editor') {
                    amount = await resolveCommissionAmount(pool, packageId, 'Editor', contentType);
                    const [existingAssign] = await pool.query(
                        'SELECT id FROM order_assignments WHERE order_id = ? AND role = "Editor" LIMIT 1',
                        [orderId]
                    );
                    if (existingAssign.length > 0) {
                        await pool.query(
                            'UPDATE order_assignments SET user_id = ?, content_type = ?, commission_amount = ? WHERE id = ?',
                            [editorUserId, contentType, amount, existingAssign[0].id]
                        );
                    } else {
                        await pool.query(
                            'INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount) VALUES (?, ?, "Editor", ?, ?)',
                            [orderId, editorUserId, contentType, amount]
                        );
                    }
                } else {
                    const [csAssign] = await pool.query('SELECT user_id FROM order_assignments WHERE order_id = ? AND role = "CS" LIMIT 1', [orderId]);
                    const csUserId = csAssign.length > 0 ? csAssign[0].user_id : null;
                    editorUserId = csUserId ? await upsertMappedEditorAssignmentForOrder(pool, {
                        orderId,
                        packageId,
                        orderStatus,
                        csUserId
                    }) : null;
                    if (editorUserId) {
                        const [editorAssign] = await pool.query(
                            'SELECT commission_amount, content_type FROM order_assignments WHERE order_id = ? AND role = "Editor" LIMIT 1',
                            [orderId]
                        );
                        amount = editorAssign.length > 0 ? Number(editorAssign[0].commission_amount || 0) : 0;
                        contentType = editorAssign.length > 0 ? String(editorAssign[0].content_type || contentType) : contentType;
                    }
                }

                if (editorUserId) {
                    await accrueCommissionLedger({
                        order_id: orderId,
                        user_id: editorUserId,
                        role: 'Editor',
                        content_type: contentType,
                        amount,
                        source_event: 'content_ready',
                        source_event_key: `content_ready:${orderId}:${editorUserId}:Editor:${contentType}`
                    });
                }
            }
        } catch (e) {
            console.error('Editor commission on content ready error:', e);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Set Ready error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/orders/:id/bengkel/done', async (req, res) => {
    try {
        await ensureOrderContentsWorkflowSchema();
        await ensureOrderRepairHistorySchema();
        const { id } = req.params;
        const body = req.body || {};
        const repairIssue = String(body.repair_issue || body.repairIssue || '').trim();
        const repairFix = String(body.repair_fix || body.repairFix || '').trim();
        let bengkelUserId = Number(body.user_id || body.userId || 0);

        if (!repairIssue || !repairFix) {
            return res.status(400).json({ error: 'Keterangan perbaikan wajib diisi' });
        }

        if (!bengkelUserId) {
            const [existingAssign] = await pool.query(
                'SELECT user_id FROM order_assignments WHERE order_id = ? AND role = "Team Bengkel" LIMIT 1',
                [id]
            );
            if (existingAssign.length > 0) bengkelUserId = Number(existingAssign[0].user_id || 0);
        }

        const [orderRows] = await pool.query('SELECT package_id FROM orders WHERE id = ? LIMIT 1', [id]);
        if (orderRows.length === 0) return res.status(404).json({ error: 'Order tidak ditemukan' });
        const packageId = orderRows[0].package_id || null;

        let amount = 0;
        if (packageId) {
            amount = await resolveCommissionAmount(pool, packageId, 'Team Bengkel', 'general');
        }

        if (bengkelUserId) {
            try {
                await pool.query(
                    `INSERT INTO order_assignments (order_id, user_id, role, content_type, commission_amount)
                     VALUES (?, ?, 'Team Bengkel', 'general', ?)
                     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), commission_amount = VALUES(commission_amount)`,
                    [id, bengkelUserId, amount]
                );
            } catch (e) {
                const [existingAssign] = await pool.query(
                    'SELECT id FROM order_assignments WHERE order_id = ? AND role = "Team Bengkel" LIMIT 1',
                    [id]
                );
                if (existingAssign.length > 0) {
                    await pool.query(
                        'UPDATE order_assignments SET user_id = ?, content_type = "general", commission_amount = ? WHERE id = ?',
                        [bengkelUserId, amount, existingAssign[0].id]
                    );
                } else {
                    throw e;
                }
            }
        }

        const [existing] = await pool.query(
            'SELECT id, status, repair_issue, repair_fix FROM order_contents WHERE order_id = ? LIMIT 1',
            [id]
        );
        const [repairStats] = await pool.query(
            'SELECT COALESCE(MAX(repair_no), 0) AS max_repair_no, COUNT(*) AS repair_count FROM order_repair_logs WHERE order_id = ?',
            [id]
        );
        const existingContent = existing.length > 0 ? existing[0] : null;
        const historyCount = Number(repairStats[0].repair_count || 0);
        const legacyRepairExists = historyCount === 0 && existingContent && (
            String(existingContent.status || '').toLowerCase().includes('sudah diperbaiki') ||
            String(existingContent.repair_issue || '').trim() ||
            String(existingContent.repair_fix || '').trim()
        );
        const repairNo = historyCount > 0
            ? Number(repairStats[0].max_repair_no || 0) + 1
            : (legacyRepairExists ? 2 : 1);

        await pool.query(
            `INSERT INTO order_repair_logs (order_id, repair_no, repair_issue, repair_fix, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            [id, repairNo, repairIssue, repairFix, bengkelUserId || null]
        );

        if (existing.length > 0) {
            try {
                await pool.query(
                    'UPDATE order_contents SET status = "Sudah Diperbaiki", repair_issue = ?, repair_fix = ?, repair_user_id = ?, updated_at = NOW() WHERE order_id = ?',
                    [repairIssue, repairFix, bengkelUserId || null, id]
                );
            } catch (e) {
                const code = String((e && e.code) || '');
                if (code !== 'ER_BAD_FIELD_ERROR') throw e;
                await pool.query(
                    'UPDATE order_contents SET status = "Sudah Diperbaiki" WHERE order_id = ?',
                    [id]
                );
            }
        } else {
            try {
                await pool.query(
                    'INSERT INTO order_contents (order_id, status, repair_issue, repair_fix, repair_user_id) VALUES (?, "Sudah Diperbaiki", ?, ?, ?)',
                    [id, repairIssue, repairFix, bengkelUserId || null]
                );
            } catch (e) {
                const code = String((e && e.code) || '');
                if (code !== 'ER_BAD_FIELD_ERROR') throw e;
                await pool.query('INSERT INTO order_contents (order_id, status) VALUES (?, "Sudah Diperbaiki")', [id]);
            }
        }

        if (bengkelUserId) {
            await accrueCommissionLedger({
                order_id: Number(id),
                user_id: bengkelUserId,
                role: 'Team Bengkel',
                content_type: 'general',
                amount,
                source_event: 'bengkel_done',
                source_event_key: `bengkel_done:${id}:${bengkelUserId}:Team Bengkel:general:${repairNo}`
            });
        }

        res.json({ success: true, status: 'Sudah Diperbaiki', repair_no: repairNo });
    } catch (e) {
        console.error('Bengkel done error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/orders/:id/repairs', async (req, res) => {
    try {
        await ensureOrderRepairHistorySchema();
        const { id } = req.params;
        const [rows] = await pool.query(
            `SELECT rl.id, rl.order_id, rl.repair_no, rl.repair_issue, rl.repair_fix, rl.user_id, rl.created_at,
                    u.name AS user_name
             FROM order_repair_logs rl
             LEFT JOIN users u ON u.id = rl.user_id
             WHERE rl.order_id = ?
             ORDER BY rl.repair_no ASC, rl.created_at ASC`,
            [id]
        );
        if (rows.length > 0) {
            return res.json({ data: rows });
        }

        const [legacy] = await pool.query(
            'SELECT status, repair_issue, repair_fix, repair_user_id, updated_at, created_at FROM order_contents WHERE order_id = ? LIMIT 1',
            [id]
        );
        if (legacy.length > 0) {
            const row = legacy[0];
            const hasLegacyRepair = String(row.status || '').toLowerCase().includes('sudah diperbaiki') ||
                String(row.repair_issue || '').trim() ||
                String(row.repair_fix || '').trim();
            if (hasLegacyRepair) {
                let userName = null;
                if (row.repair_user_id) {
                    const [users] = await pool.query('SELECT name FROM users WHERE id = ? LIMIT 1', [row.repair_user_id]);
                    userName = users.length > 0 ? users[0].name : null;
                }
                return res.json({
                    data: [{
                        id: null,
                        order_id: Number(id),
                        repair_no: 1,
                        repair_issue: row.repair_issue || '',
                        repair_fix: row.repair_fix || '',
                        user_id: row.repair_user_id || null,
                        user_name: userName,
                        created_at: row.updated_at || row.created_at || null,
                        is_legacy: true
                    }]
                });
            }
        }
        res.json({ data: [] });
    } catch (e) {
        console.error('Order repairs error:', e);
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
                    await accrueCommissionLedger({
                        order_id: id,
                        user_id: userId,
                        role: 'Editor',
                        content_type: ctype,
                        amount,
                        source_event: 'content_ready',
                        source_event_key: `content_ready:${id}:${userId}:Editor:${ctype}`
                    });
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

app.post('/api/openai-proxy', async (req, res) => {
    try {
        const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
        if (!apiKey) {
            return res.status(500).json({ error: 'OPENAI_API_KEY belum diset di server' });
        }

        const body = req.body || {};
        const model = String(body.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
        const systemPrompt = String(body.systemPrompt || '').trim();
        const userMessage = String(body.userMessage || '').trim();
        const images = Array.isArray(body.images) ? body.images : [];
        const maxTokens = Number(body.maxTokens || 500);
        if (!systemPrompt || (!userMessage && images.length === 0)) {
            return res.status(400).json({ error: 'systemPrompt wajib diisi, dan minimal ada userMessage atau images' });
        }

        const safeImages = [];
        for (const img of images) {
            if (safeImages.length >= 2) break;
            const s = String(img || '').trim();
            if (!s) continue;
            const isDataImage = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(s);
            const isHttps = /^https:\/\/.+/i.test(s);
            if (!isDataImage && !isHttps) continue;
            if (isDataImage) {
                const base64Part = s.split(',')[1] || '';
                const approxBytes = Math.floor((base64Part.length * 3) / 4);
                if (approxBytes > 4 * 1024 * 1024) {
                    return res.status(413).json({ error: 'Ukuran gambar terlalu besar (maks 4MB per gambar)' });
                }
            }
            safeImages.push(s);
        }

        const userContent = safeImages.length > 0
            ? [
                ...(userMessage ? [{ type: 'text', text: userMessage }] : []),
                ...safeImages.map((u) => ({ type: 'image_url', image_url: { url: u } }))
            ]
            : userMessage;

        const payload = JSON.stringify({
            model,
            max_tokens: Number.isFinite(maxTokens) ? maxTokens : 500,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ]
        });

        const requestOptions = {
            method: 'POST',
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const upstream = await new Promise((resolve, reject) => {
            const r = https.request(requestOptions, (resp) => {
                let data = '';
                resp.on('data', (chunk) => { data += chunk; });
                resp.on('end', () => resolve({ status: resp.statusCode || 500, body: data }));
            });
            r.on('error', reject);
            r.write(payload);
            r.end();
        });

        let parsed = null;
        try { parsed = upstream.body ? JSON.parse(upstream.body) : null; } catch (_) {}
        if (upstream.status < 200 || upstream.status >= 300) {
            const msg = parsed && parsed.error && parsed.error.message ? parsed.error.message : 'Upstream error';
            return res.status(502).json({ error: msg });
        }

        const content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message
            ? parsed.choices[0].message.content
            : '';
        res.json({ content, raw: parsed });
    } catch (e) {
        console.error('OpenAI proxy error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/openai-proxy/health', async (req, res) => {
    try {
        const hasKey = !!String(process.env.OPENAI_API_KEY || '').trim();
        res.json({ ok: true, hasKey });
    } catch (e) {
        res.status(500).json({ ok: false });
    }
});

app.get('/api/cash/transactions', async (req, res) => {
    try {
        await ensureTransactionsCategoryColumn();
        const today = new Date();
        const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
        const startDate = String(req.query.startDate || '').trim() || defaultStart;
        const endDate = String(req.query.endDate || '').trim() || defaultEnd;

        const p = await getPool();
        const [summaryRows] = await p.query(
            `SELECT
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) + SUM(CASE WHEN type = 'commission_pay' THEN amount ELSE 0 END) AS total_expense
             FROM transactions
             WHERE type IN ('income','expense','commission_pay')
               AND DATE(COALESCE(updated_at, created_at)) BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        const [unpaidRows] = await p.query(
            `SELECT COALESCE(SUM(amount), 0) AS unpaid_commission
             FROM commission_ledger
             WHERE approval_status = 'approved'
               AND status != 'paid'`
        );

        const totalIncome = Number((summaryRows[0] && summaryRows[0].total_income) || 0);
        const totalExpense = Number((summaryRows[0] && summaryRows[0].total_expense) || 0);
        const balance = totalIncome - totalExpense;
        const unpaidCommission = Number((unpaidRows[0] && unpaidRows[0].unpaid_commission) || 0);

        const [rows] = await p.query(
            `SELECT
                t.id,
                t.order_id,
                t.client_id,
                t.type,
                t.amount,
                COALESCE(t.category,
                    CASE
                        WHEN t.type = 'income' AND t.order_id IS NOT NULL THEN 'Pembayaran Order (Pelunasan)'
                        WHEN t.type = 'commission_pay' THEN 'Komisi'
                        ELSE 'Lainnya'
                    END) AS category,
                t.note,
                t.created_at,
                t.updated_at,
                t.trx_date,
                t.employee_user_id,
                DATE(COALESCE(t.trx_date, t.created_at)) AS trx_date_value,
                DATE(COALESCE(t.updated_at, t.created_at)) AS display_date_value,
                COALESCE(t.updated_at, t.created_at) AS display_datetime,
                c.name AS client_name,
                u.name AS employee_name,
                u.role AS employee_role
             FROM transactions t
             LEFT JOIN orders o ON t.order_id = o.id
             LEFT JOIN clients c ON o.client_id = c.id
             LEFT JOIN users u ON t.employee_user_id = u.id
             WHERE t.type IN ('income','expense','commission_pay')
               AND DATE(COALESCE(t.updated_at, t.created_at)) BETWEEN ? AND ?
             ORDER BY COALESCE(t.updated_at, t.created_at) DESC, t.id DESC`,
            [startDate, endDate]
        );

        res.json({
            summary: {
                total_income: totalIncome,
                total_expense: totalExpense,
                balance: balance,
                unpaid_commission: unpaidCommission
            },
            transactions: rows
        });
    } catch (e) {
        console.error('Cash transactions fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/cash/transactions', async (req, res) => {
    try {
        await ensureTransactionsCategoryColumn();
        const type = String(req.body.type || '').trim();
        const amount = Number(req.body.amount);
        const category = req.body.category ? String(req.body.category).trim() : null;
        const note = req.body.note ? String(req.body.note).trim() : null;
        const trxDate = String(req.body.trx_date || '').trim() || new Date().toISOString().slice(0, 10);
        const orderId = req.body.order_id ? Number(req.body.order_id) : null;
        const employeeUserId = req.body.employee_user_id ? Number(req.body.employee_user_id) : null;

        if (!['income', 'expense'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type' });
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        if (employeeUserId && !Number.isFinite(employeeUserId)) {
            return res.status(400).json({ error: 'Invalid employee_user_id' });
        }

        const p = await getPool();
        const [result] = await p.query(
            'INSERT INTO transactions (type, amount, category, note, trx_date, order_id, employee_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [type, amount, category, note, trxDate, orderId, employeeUserId]
        );

        res.json({ success: true, id: result.insertId });
    } catch (e) {
        console.error('Cash transaction create error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.patch('/api/cash/transactions/:id', async (req, res) => {
    try {
        await ensureTransactionsCategoryColumn();
        const id = Number(req.params.id);
        const type = String(req.body.type || '').trim();
        const amount = Number(req.body.amount);
        const category = req.body.category ? String(req.body.category).trim() : null;
        const note = req.body.note ? String(req.body.note).trim() : null;
        const trxDate = String(req.body.trx_date || '').trim() || new Date().toISOString().slice(0, 10);
        const orderId = req.body.order_id ? Number(req.body.order_id) : null;
        const employeeUserId = req.body.employee_user_id ? Number(req.body.employee_user_id) : null;

        if (!id) {
            return res.status(404).json({ error: 'Not found' });
        }
        if (!['income', 'expense'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type' });
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        if (employeeUserId && !Number.isFinite(employeeUserId)) {
            return res.status(400).json({ error: 'Invalid employee_user_id' });
        }

        const p = await getPool();
        const [rows] = await p.query(
            "SELECT id FROM transactions WHERE id = ? AND type IN ('income','expense') LIMIT 1",
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Not found' });
        }

        await p.query(
            `UPDATE transactions
             SET type = ?, amount = ?, category = ?, note = ?, trx_date = ?, order_id = ?, employee_user_id = ?, updated_at = NOW()
             WHERE id = ?`,
            [type, amount, category, note, trxDate, orderId, employeeUserId, id]
        );

        res.json({ success: true, id });
    } catch (e) {
        console.error('Cash transaction update error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/payroll/summary', async (req, res) => {
    try {
        await ensureTransactionsCategoryColumn();
        const month = String(req.query.month || '').trim();
        let startDate = '';
        let endDate = '';
        if (/^\d{4}-\d{2}$/.test(month)) {
            const year = Number(month.slice(0, 4));
            const monthIndex = Number(month.slice(5, 7)) - 1;
            startDate = new Date(year, monthIndex, 1).toISOString().slice(0, 10);
            endDate = new Date(year, monthIndex + 1, 0).toISOString().slice(0, 10);
        } else {
            const today = new Date();
            startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
        }

        const p = await getPool();
        const [employees] = await p.query(
            `SELECT id, name, email, role
             FROM users
             WHERE LOWER(COALESCE(role, '')) NOT IN ('super_admin', 'superadmin')
             ORDER BY name ASC`
        );

        const [transactionRows] = await p.query(
            `SELECT
                t.id,
                t.employee_user_id,
                t.type,
                t.category,
                t.amount,
                t.note,
                t.order_id,
                t.created_at,
                t.updated_at,
                t.trx_date,
                DATE(COALESCE(t.trx_date, t.created_at)) AS date_value,
                COALESCE(t.updated_at, t.created_at) AS datetime_value
             FROM transactions t
             WHERE t.employee_user_id IS NOT NULL
               AND t.type = 'expense'
               AND DATE(COALESCE(t.trx_date, t.created_at)) BETWEEN ? AND ?
             ORDER BY DATE(COALESCE(t.trx_date, t.created_at)) DESC, t.id DESC`,
            [startDate, endDate]
        );

        const [commissionRows] = await p.query(
            `SELECT
                cl.id,
                cl.user_id,
                cl.order_id,
                cl.role,
                cl.source_event,
                cl.amount,
                cl.status,
                cl.approval_status,
                cl.approved_at,
                cl.created_at,
                DATE(COALESCE(cl.approved_at, cl.created_at)) AS date_value,
                COALESCE(cl.approved_at, cl.created_at) AS datetime_value,
                c.name AS client_name,
                pck.name AS package_name
             FROM commission_ledger cl
             LEFT JOIN orders o ON cl.order_id = o.id
             LEFT JOIN clients c ON o.client_id = c.id
             LEFT JOIN packages pck ON o.package_id = pck.id
             WHERE cl.user_id IS NOT NULL
               AND cl.approval_status = 'approved'
               AND DATE(COALESCE(cl.approved_at, cl.created_at)) BETWEEN ? AND ?
             ORDER BY COALESCE(cl.approved_at, cl.created_at) DESC, cl.id DESC`,
            [startDate, endDate]
        );

        const [serviceRows] = await p.query(
            `SELECT
                COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'Pembayaran Layanan' THEN amount ELSE 0 END), 0) AS service_payment,
                COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'Tools/SaaS' THEN amount ELSE 0 END), 0) AS tools_payment,
                COALESCE(SUM(CASE WHEN type = 'expense' AND category = 'Internet' THEN amount ELSE 0 END), 0) AS internet_payment
             FROM transactions
             WHERE DATE(COALESCE(trx_date, created_at)) BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        const payrollMap = new Map();
        const ensurePayrollEntry = (userId) => {
            const normalizedUserId = Number(userId);
            if (!payrollMap.has(normalizedUserId)) {
                payrollMap.set(normalizedUserId, {
                    base_salary: 0,
                    bonus: 0,
                    commission: 0,
                    kasbon: 0,
                    benefit_total: 0,
                    income_items: [],
                    expense_items: [],
                    benefit_items: []
                });
            }
            return payrollMap.get(normalizedUserId);
        };

        transactionRows.forEach((row) => {
            const entry = ensurePayrollEntry(row.employee_user_id);
            const category = String(row.category || '').trim();
            const amount = Number(row.amount || 0);
            const payload = {
                source_type: 'transaction',
                transaction_id: row.id,
                order_id: row.order_id,
                category,
                amount,
                note: row.note,
                date_value: row.date_value,
                datetime_value: row.datetime_value
            };

            if (category === 'Gaji/Payroll') {
                entry.base_salary += amount;
                entry.income_items.push(payload);
            } else if (category === 'Bonus') {
                entry.bonus += amount;
                entry.income_items.push(payload);
            } else if (category === 'Kasbon') {
                entry.kasbon += amount;
                entry.expense_items.push(payload);
            } else {
                entry.benefit_total += amount;
                entry.benefit_items.push(payload);
            }
        });

        commissionRows.forEach((row) => {
            const entry = ensurePayrollEntry(row.user_id);
            const amount = Number(row.amount || 0);
            entry.commission += amount;
            entry.income_items.push({
                source_type: 'commission',
                ledger_id: row.id,
                order_id: row.order_id,
                category: 'Komisi Approved',
                amount,
                role: row.role,
                source_event: row.source_event,
                status: row.status,
                approval_status: row.approval_status,
                client_name: row.client_name,
                package_name: row.package_name,
                date_value: row.date_value,
                datetime_value: row.datetime_value
            });
        });

        const rows = employees
            .map((employee) => {
                const payroll = payrollMap.get(Number(employee.id)) || {
                    base_salary: 0,
                    bonus: 0,
                    commission: 0,
                    kasbon: 0,
                    benefit_total: 0,
                    income_items: [],
                    expense_items: [],
                    benefit_items: []
                };
                const totalReceived = payroll.base_salary + payroll.bonus + payroll.commission - payroll.kasbon;
                return {
                    user_id: employee.id,
                    name: employee.name,
                    email: employee.email,
                    role: employee.role,
                    base_salary: payroll.base_salary,
                    bonus: payroll.bonus,
                    commission: payroll.commission,
                    kasbon: payroll.kasbon,
                    benefit_total: payroll.benefit_total,
                    total_received: totalReceived,
                    details: {
                        income_items: payroll.income_items,
                        expense_items: payroll.expense_items,
                        benefit_items: payroll.benefit_items
                    }
                };
            })
            .filter((row) => row.base_salary > 0 || row.bonus > 0 || row.commission > 0 || row.kasbon > 0 || row.benefit_total > 0);

        const totals = rows.reduce((acc, row) => {
            acc.base_salary += Number(row.base_salary || 0);
            acc.bonus += Number(row.bonus || 0);
            acc.commission += Number(row.commission || 0);
            acc.kasbon += Number(row.kasbon || 0);
            acc.total_received += Number(row.total_received || 0);
            return acc;
        }, { base_salary: 0, bonus: 0, commission: 0, kasbon: 0, total_received: 0 });

        const serviceSummary = {
            service_payment: Number((serviceRows[0] && serviceRows[0].service_payment) || 0),
            tools_payment: Number((serviceRows[0] && serviceRows[0].tools_payment) || 0),
            internet_payment: Number((serviceRows[0] && serviceRows[0].internet_payment) || 0)
        };
        serviceSummary.total_service_cost =
            serviceSummary.service_payment +
            serviceSummary.tools_payment +
            serviceSummary.internet_payment;

        res.json({
            period: { month: month || startDate.slice(0, 7), start_date: startDate, end_date: endDate },
            commission_rule: {
                included_when: 'approved',
                included_date_field: 'approved_at'
            },
            totals,
            service_summary: serviceSummary,
            rows
        });
    } catch (e) {
        console.error('Payroll summary fetch error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/cash/transactions/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return res.status(404).json({ error: 'Not found' });
        }

        const p = await getPool();
        const [rows] = await p.query(
            "SELECT id FROM transactions WHERE id = ? AND type IN ('income','expense') LIMIT 1",
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Not found' });
        }

        await p.query('DELETE FROM transactions WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Cash transaction delete error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start Server
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`Server running on http://${displayHost}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    // #region debug-point A:startup-ping
    (() => {
        try {
            const fs = require('fs');
            const envPath = '.dbg/commission-payout-500.env';
            let url = 'http://127.0.0.1:7777/event';
            let sessionId = 'commission-payout-500';
            try {
                const c = fs.readFileSync(envPath, 'utf8');
                url = c.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || url;
                sessionId = c.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
            } catch (_) {}
            const payload = JSON.stringify({
                sessionId,
                runId: 'pre-fix',
                hypothesisId: 'A',
                location: 'server.js:listen',
                msg: '[DEBUG] server started',
                data: { port: PORT, host: HOST },
                ts: Date.now()
            });
            const u = new URL(url);
            const client = u.protocol === 'https:' ? require('https') : require('http');
            const req = client.request(
                {
                    hostname: u.hostname,
                    port: u.port,
                    path: u.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                },
                (resp) => {
                    resp.on('data', () => {});
                    resp.on('end', () => {});
                }
            );
            req.on('error', () => {});
            req.write(payload);
            req.end();
        } catch (_) {}
    })();
    // #endregion
});
