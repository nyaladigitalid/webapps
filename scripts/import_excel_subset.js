
require('dotenv').config();
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const path = require('path');

// Excel Date to JS Date
function excelDateToJSDate(serial) {
    if (!serial || isNaN(serial)) return null;
    // Excel base date is Dec 30 1899
    const utc_days  = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;                                        
    const date_info = new Date(utc_value * 1000);
    return date_info;
}

// Map Excel Status to System Status
function mapStatus(excelStatus) {
    if (!excelStatus) return 'pending';
    const status = excelStatus.toLowerCase();
    if (status.includes('baru')) return 'pending';
    if (status.includes('aktif') && !status.includes('tidak')) return 'processing';
    if (status.includes('tidak aktif') || status.includes('selesai')) return 'completed';
    return 'pending';
}

// Helper to ensure no undefined values
function s(val) {
    return val === undefined ? null : val;
}

async function importData() {
    console.log('Starting migration of first 10 rows...');

    let config = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyala_ads'
    };

    if (process.env.MYSQL_URL) {
        const u = new URL(process.env.MYSQL_URL);
        config.host = u.hostname;
        config.port = Number(u.port);
        config.user = decodeURIComponent(u.username);
        config.password = decodeURIComponent(u.password);
        config.database = u.pathname.replace(/^\//, '');
    }

    const connection = await mysql.createConnection(config);

    try {
        // 1. Load Reference Data
        const [users] = await connection.query('SELECT id, name, role FROM users');
        const [packages] = await connection.query('SELECT id, price FROM packages');
        
        const userMap = new Map(); // Name -> ID
        users.forEach(u => userMap.set(u.name.toLowerCase(), u.id));

        const packageMap = new Map(); // Price -> ID
        packages.forEach(p => packageMap.set(Number(p.price), p.id));
        const defaultPackageId = packages.length > 0 ? packages[0].id : null;

        if (!defaultPackageId) {
            throw new Error('No packages found in database. Please seed packages first.');
        }

        // 2. Read Excel
        const filePath = path.join(__dirname, '../data', 'DataKlien.xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays

        // Headers are at row 0, data starts at row 1
        const headers = data[0];
        // Column Indices
        const idx = {
            Status: 0,
            No: 1,
            ID: 2,
            Tanggal: 3,
            Closing: 4,
            Nama: 5,
            NamaUsaha: 6,
            JenisUsaha: 7,
            Whatsapp: 8,
            Deskripsi: 9,
            Lokasi: 10,
            Usia: 11,
            Gender: 12,
            Durasi: 13,
            Mulai: 14,
            Selesai: 15,
            Catatan: 16,
            ChatId: 17,
            VideoSelesai: 18,
            TotalBayar: 19,
            CS: 20,
            CampaignName: 23,
            AccountId: 24,
            Fanspage: 25,
            KampanyeId: 27
        };

        // Process rows 11 to 100 (slice 11 to 101)
        // Note: Previously processed 1-10.
        console.log('Continuing migration from row 11 to 100...');
        const rowsToProcess = data.slice(11, 101);

        for (const row of rowsToProcess) {
            try {
                // Heuristic to detect shift
            // Normal: ID is at index 2 (e.g., "ORD-1")
            // Shifted: ID is at index 1 (e.g., "ORD-3")
            
            let isShifted = false;
            let currentIdx = { ...idx };
            
            if (row[2] && String(row[2]).startsWith('ORD-')) {
                // Normal
            } else if (row[1] && String(row[1]).startsWith('ORD-')) {
                // Shifted Left by 1 (Missing Status column)
                isShifted = true;
                for (const key in currentIdx) {
                    currentIdx[key] = currentIdx[key] - 1;
                }
            } else {
                console.log('Skipping row, cannot identify ID format:', row);
                continue;
            }

            // Check if we have a valid row number (No)
            // If normal, No is at 1. If shifted, No is at 0.
            if (!row[currentIdx.No]) continue;

            const orderIdRef = row[currentIdx.ID];
            console.log(`Processing Order: ${orderIdRef || 'Unknown'}`);

            // --- A. Client ---
            let clientId;
            const phoneRaw = row[currentIdx.Whatsapp];
            const phone = phoneRaw ? String(phoneRaw).replace(/[^0-9]/g, '') : null;
            const name = row[currentIdx.Nama] || 'Unknown';
            const businessName = row[currentIdx.NamaUsaha];

            // Check existing client
            let existingClient = [];
            // ... (rest of logic using currentIdx)

            if (phone) {
                [existingClient] = await connection.query('SELECT id FROM clients WHERE whatsapp LIKE ?', [`%${phone}%`]);
            } else {
                 [existingClient] = await connection.query('SELECT id FROM clients WHERE name = ? AND business_name = ?', [name, businessName]);
            }

            if (existingClient.length > 0) {
                clientId = existingClient[0].id;
            } else {
                const [res] = await connection.execute(
                    'INSERT INTO clients (name, business_name, business_type, whatsapp, address) VALUES (?, ?, ?, ?, ?)',
                    [s(name), s(businessName), s(row[currentIdx.JenisUsaha]), s(phone), s(row[currentIdx.Lokasi])]
                );
                clientId = res.insertId;
                console.log(`  -> Created Client: ${name} (${clientId})`);
            }

            // --- B. CS Assignment ---
            let csId = null;
            const csName = row[currentIdx.CS];
            if (csName) {
                const normalizedCsName = csName.toLowerCase();
                if (userMap.has(normalizedCsName)) {
                    csId = userMap.get(normalizedCsName);
                } else {
                    // Create new CS user
                    const [res] = await connection.execute(
                        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                        [s(csName), `${normalizedCsName}@nyaladigital.com`, '123456', 'CS'] // Default password
                    );
                    csId = res.insertId;
                    userMap.set(normalizedCsName, csId);
                    console.log(`  -> Created CS User: ${csName} (${csId})`);
                }
            }

            // --- C. Package ---
            const price = Number(row[currentIdx.TotalBayar]) || 0;
            let packageId = packageMap.get(price) || defaultPackageId;

            // --- D. Order ---
            const createdAt = excelDateToJSDate(row[currentIdx.Tanggal]) || new Date();
            const startDate = excelDateToJSDate(row[currentIdx.Mulai]);
            const endDate = excelDateToJSDate(row[currentIdx.Selesai]);
            const duration = Number(row[currentIdx.Durasi]) || 0; // in days
            
            // Status Logic: if shifted (isShifted), we might assume status is 'active' or use default
            let status = 'pending';
            if (isShifted) {
                status = 'active'; // Assume shifted rows are active if missing status
            } else {
                status = mapStatus(row[currentIdx.Status]);
            }
            
            // Calculate duration in months (approx)
            const durationMonths = Math.max(1, Math.round(duration / 30));

            const [orderRes] = await connection.execute(
                'INSERT INTO orders (client_id, package_id, status, service_type, created_at, start_date, end_date, duration_months, days_remaining) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [s(clientId), s(packageId), s(status), 'ads', s(createdAt), s(startDate), s(endDate), s(durationMonths), s(duration)]
            );
            const orderId = orderRes.insertId;
            console.log(`  -> Created Order: ${orderId}`);

            // --- E. Order Details ---
            if (row[currentIdx.Deskripsi]) {
                await connection.execute(
                    'INSERT INTO order_details (order_id, description) VALUES (?, ?)',
                    [orderId, s(row[currentIdx.Deskripsi])]
                );
            }

            // --- F. Order Targets ---
            if (row[currentIdx.Lokasi] || row[currentIdx.Usia] || row[currentIdx.Gender]) {
                await connection.execute(
                    'INSERT INTO order_targets (order_id, locations, age_range, gender) VALUES (?, ?, ?, ?)',
                    [orderId, s(row[currentIdx.Lokasi]), s(row[currentIdx.Usia]), s(row[currentIdx.Gender])]
                );
            }

            // --- G. Payments ---
            if (price > 0) {
                await connection.execute(
                    'INSERT INTO payments (order_id, total, method, status) VALUES (?, ?, ?, ?)',
                    [orderId, s(price), 'transfer', 'paid']
                );
            }

            // --- H. Order Assignment ---
            if (csId) {
                await connection.execute(
                    'INSERT INTO order_assignments (order_id, user_id, role, content_type) VALUES (?, ?, ?, ?)',
                    [orderId, csId, 'CS', 'general']
                );
            }

            // --- I. Campaign ---
            const campaignId = row[currentIdx.KampanyeId];
            if (campaignId && campaignId !== '#REF!') {
                await connection.execute(
                    'INSERT INTO campaigns (order_id, client_id, campaign_id, campaign_name, ad_account_id, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [orderId, clientId, s(campaignId), s(row[currentIdx.CampaignName] || 'Unknown Campaign'), s(row[currentIdx.AccountId]), 'active']
                );
                console.log(`  -> Created Campaign: ${campaignId}`);
            }
        } catch (error) {
            console.error(`Error processing row: ${JSON.stringify(row)}`, error);
        }
        }

        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await connection.end();
    }
}

importData();
