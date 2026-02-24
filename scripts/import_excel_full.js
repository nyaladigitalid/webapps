require('dotenv').config();
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const path = require('path');

// Excel Date to JS Date
function excelDateToJSDate(serial) {
    if (!serial || isNaN(serial)) return null;
    const utc_days  = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;                                        
    const date_info = new Date(utc_value * 1000);
    return date_info;
}

// Map Excel Status to System Status
function mapStatus(excelStatus) {
    if (!excelStatus) return 'pending';
    const status = String(excelStatus).toLowerCase();
    if (status.includes('baru')) return 'pending';
    if (status.includes('aktif') && !status.includes('tidak')) return 'processing';
    if (status.includes('tidak aktif') || status.includes('selesai') || status.includes('habis')) return 'completed';
    return 'pending';
}

function s(val) {
    return val === undefined ? null : val;
}

async function importData() {
    console.log('Starting full import/migration...');

    let config = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'nyala_ads'
    };

    if (process.env.MYSQL_URL) {
        try {
            const u = new URL(process.env.MYSQL_URL);
            config.host = u.hostname;
            config.port = Number(u.port);
            config.user = decodeURIComponent(u.username);
            config.password = decodeURIComponent(u.password);
            config.database = u.pathname.replace(/^\//, '');
        } catch (e) {
            console.error('Invalid MYSQL_URL:', e);
        }
    }

    const connection = await mysql.createConnection(config);

    try {
        // 1. Load Reference Data
        const [users] = await connection.query('SELECT id, name FROM users');
        const userMap = new Map();
        users.forEach(u => userMap.set(u.name.toLowerCase(), u.id));

        const [packages] = await connection.query('SELECT id, price FROM packages');
        const packageMap = new Map();
        packages.forEach(p => packageMap.set(Number(p.price), p.id));
        let defaultPackageId = packages.length > 0 ? packages[0].id : null;
        if (!defaultPackageId) {
             const [pkgRes] = await connection.execute('INSERT INTO packages (name, price, duration_days) VALUES (?, ?, ?)', ['Default Package', 0, 30]);
             packageMap.set(0, pkgRes.insertId);
             defaultPackageId = pkgRes.insertId;
        }

        // 2. Read Excel
        const filePath = path.join(__dirname, '../data', 'DataKlien.xlsx');
        console.log(`Reading Excel file: ${filePath}`);
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        console.log(`Total rows in Excel: ${data.length}`);

        // Column Indices
        const idx = {
            Status: 0, No: 1, ID: 2, Tanggal: 3, Closing: 4, Nama: 5, NamaUsaha: 6, JenisUsaha: 7, Whatsapp: 8,
            Deskripsi: 9, Lokasi: 10, Usia: 11, Gender: 12, Durasi: 13, Mulai: 14, Selesai: 15, Catatan: 16,
            ChatId: 17, VideoSelesai: 18, TotalBayar: 19, CS: 20, SystemDate: 21, NamaSingkat: 22,
            CampaignName: 23, AccountId: 24, Fanspage: 25, LinkWhatsapp: 26, KampanyeId: 27, LimitBudget: 28,
            Advertiser: 29, Kategori: 30, TanggalUp: 31, StatusPembayaran: 32
        };

        // Process ALL data rows (skip header at index 0)
        const rowsToProcess = data.slice(1);
        console.log(`Processing ${rowsToProcess.length} rows...`);

        let processedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (const row of rowsToProcess) {
            try {
                // Determine shift and ID
                let isShifted = false;
                let currentIdx = { ...idx };
                let orderIdRef = null;

                // Helper to check for WA number
                const isWA = (val) => val && String(val).replace(/[^0-9]/g, '').startsWith('62');

                // 1. Check ID in Col 1 (Full Shift)
                if (row[1] && (String(row[1]).startsWith('ORD-') || String(row[1]).startsWith('ID-'))) {
                    isShifted = true;
                    for (const key in currentIdx) {
                        currentIdx[key] = currentIdx[key] - 1;
                    }
                    orderIdRef = row[1];
                } 
                // 2. Check ID in Col 2 (Standard or Partial Shift)
                else if (row[2] && (String(row[2]).startsWith('ORD-') || String(row[2]).startsWith('ID-'))) {
                    orderIdRef = row[2];
                    
                    // Check for Partial Shift (Missing Closing col at 4)
                    const waAt8 = isWA(row[8]);
                    const waAt7 = isWA(row[7]);
                    
                    if (waAt7 && !waAt8) {
                        // Partial shift: Indices > 3 are shifted -1
                        for (const key in currentIdx) {
                            if (idx[key] > 3) currentIdx[key] = idx[key] - 1;
                        }
                    }
                }
                // 3. No ID but Valid Data (Recover via WA position)
                else {
                    const waIndex = row.findIndex(c => isWA(c));
                    if (waIndex > -1) {
                        // Calculate shift based on WA position
                        const shift = waIndex - 8;
                        for (const key in currentIdx) {
                            currentIdx[key] = idx[key] + shift;
                        }
                        // Generate ID
                        orderIdRef = `GEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    } else {
                        skippedCount++;
                        continue;
                    }
                }

                if (!orderIdRef) {
                    skippedCount++;
                    continue;
                }

                // --- Client ---
                let clientId;
                const phoneRaw = row[currentIdx.Whatsapp];
                const phone = phoneRaw ? String(phoneRaw).replace(/[^0-9]/g, '') : null;
                const name = row[currentIdx.Nama] || 'Unknown';
                const businessName = row[currentIdx.NamaUsaha];

                let existingClient = [];
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
                }

                // --- CS ---
                let csId = null;
                const csName = row[currentIdx.CS];
                if (csName) {
                    const normalizedCsName = csName.toLowerCase();
                    if (userMap.has(normalizedCsName)) {
                        csId = userMap.get(normalizedCsName);
                    } else {
                        const [res] = await connection.execute(
                            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                            [s(csName), `${normalizedCsName.replace(/\s+/g, '.')}@nyaladigital.com`, '123456', 'CS'] 
                        );
                        csId = res.insertId;
                        userMap.set(normalizedCsName, csId);
                    }
                }

                // --- Package ---
                const price = Number(row[currentIdx.TotalBayar]) || 0;
                let packageId = packageMap.get(price) || defaultPackageId;

                // --- Order Data ---
                const createdAt = excelDateToJSDate(row[currentIdx.Tanggal]) || new Date();
                const startDate = excelDateToJSDate(row[currentIdx.Mulai]);
                const endDate = excelDateToJSDate(row[currentIdx.Selesai]);
                const duration = Number(row[currentIdx.Durasi]) || 0;
                
                let status = 'pending';
                if (isShifted) {
                    status = mapStatus(row[0]);
                } else {
                    status = mapStatus(row[currentIdx.Status]);
                }
                const durationMonths = Math.max(1, Math.round(duration / 30));

                // --- Campaign Data Check ---
                const campaignId = row[currentIdx.KampanyeId];
                const hasCampaign = campaignId && campaignId !== '#REF!' && String(campaignId).trim() !== '';

                // --- Duplicate / Existing Order Check ---
                // Find ALL potential orders for this client+package+date
                const [existingOrders] = await connection.query(
                    'SELECT id FROM orders WHERE client_id = ? AND package_id = ? AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) < 86400',
                    [clientId, packageId, createdAt]
                );

                let targetOrderId = null;
                let isNewOrder = true;

                if (existingOrders.length > 0) {
                    if (hasCampaign) {
                        for (const ord of existingOrders) {
                            // Check if this order ALREADY has this specific campaign
                            const [camps] = await connection.query('SELECT id FROM campaigns WHERE order_id = ? AND campaign_id = ?', [ord.id, campaignId]);
                            if (camps.length > 0) {
                                // Exactly this order+campaign exists. Totally duplicate.
                                targetOrderId = ord.id;
                                isNewOrder = false;
                                break; 
                            }
                        }
                        
                        if (isNewOrder) {
                            // No existing order has this campaign.
                            // Check if any existing order has NO campaign (empty slot)
                            for (const ord of existingOrders) {
                                const [camps] = await connection.query('SELECT id FROM campaigns WHERE order_id = ?', [ord.id]);
                                if (camps.length === 0) {
                                    // Found an empty slot! Use this order.
                                    targetOrderId = ord.id;
                                    isNewOrder = false;
                                    break;
                                }
                            }
                        }
                    } else {
                        // No campaign ID in Excel row.
                        // If no campaign ID, we assume it's a duplicate of the first one found.
                        targetOrderId = existingOrders[0].id;
                        isNewOrder = false;
                    }
                }

                if (isNewOrder) {
                    // Create New Order
                    const [orderRes] = await connection.execute(
                        'INSERT INTO orders (client_id, package_id, status, service_type, created_at, start_date, end_date, duration_months, days_remaining) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [s(clientId), s(packageId), s(status), 'ads', s(createdAt), s(startDate), s(endDate), s(durationMonths), s(duration)]
                    );
                    targetOrderId = orderRes.insertId;
                    createdCount++;

                    // Details
                    if (row[currentIdx.Deskripsi]) {
                        await connection.execute('INSERT INTO order_details (order_id, description) VALUES (?, ?)', [targetOrderId, s(row[currentIdx.Deskripsi])]);
                    }
                    // Targets
                    if (row[currentIdx.Lokasi] || row[currentIdx.Usia] || row[currentIdx.Gender]) {
                        await connection.execute('INSERT INTO order_targets (order_id, locations, age_range, gender) VALUES (?, ?, ?, ?)', [targetOrderId, s(row[currentIdx.Lokasi]), s(row[currentIdx.Usia]), s(row[currentIdx.Gender])]);
                    }
                    // Payments
                    if (price > 0) {
                        await connection.execute('INSERT INTO payments (order_id, total, method, status) VALUES (?, ?, ?, ?)', [targetOrderId, s(price), 'transfer', 'paid']);
                    }
                    // Assignment
                    if (csId) {
                        await connection.execute('INSERT INTO order_assignments (order_id, user_id, role, content_type) VALUES (?, ?, ?, ?)', [targetOrderId, csId, 'CS', 'general']);
                    }
                }

                // --- Insert Campaign if needed ---
                if (hasCampaign && targetOrderId) {
                    // Check if campaign already linked to this order
                    const [existingCamps] = await connection.query('SELECT id FROM campaigns WHERE order_id = ? AND campaign_id = ?', [targetOrderId, campaignId]);
                    if (existingCamps.length === 0) {
                        await connection.execute(
                            'INSERT INTO campaigns (order_id, client_id, campaign_id, campaign_name, ad_account_id, status) VALUES (?, ?, ?, ?, ?, ?)',
                            [targetOrderId, clientId, s(campaignId), s(row[currentIdx.CampaignName] || 'Unknown Campaign'), s(row[currentIdx.AccountId]), 'active']
                        );
                        updatedCount++;
                    }
                }

                processedCount++;
                if (processedCount % 100 === 0) console.log(`Processed ${processedCount} rows...`);

            } catch (error) {
                console.error(`Error processing row index ${rowsToProcess.indexOf(row) + 1}:`, error.message);
                errorCount++;
            }
        }

        console.log(`Import completed.`);
        console.log(`- Total Processed: ${processedCount}`);
        console.log(`- Skipped: ${skippedCount}`);
        console.log(`- Created New Orders: ${createdCount}`);
        console.log(`- Updated/Added Campaigns: ${updatedCount}`);
        console.log(`- Errors: ${errorCount}`);

    } catch (err) {
        console.error('Import failed:', err);
    } finally {
        await connection.end();
    }
}

importData();
