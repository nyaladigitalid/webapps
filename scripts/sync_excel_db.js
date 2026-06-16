const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const excelPath = process.env.EXCEL_PATH || 'C:/Users/HP/Downloads/DataKlien-OrderUMKM-V3 (2).xlsx';

// Check args
const isDryRun = !process.argv.includes('--write');

function normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '628' + cleaned.slice(2);
    } else if (cleaned.startsWith('8')) {
        cleaned = '628' + cleaned.slice(1);
    } else if (cleaned.startsWith('6208')) {
        cleaned = '628' + cleaned.slice(4);
    }
    return cleaned;
}

function parseExcelDate(val) {
    if (!val) return null;
    if (typeof val === 'number') {
        // Excel serial date
        return new Date((val - 25569) * 86400 * 1000);
    }
    if (typeof val === 'string') {
        let cleanVal = val.toLowerCase().trim();
        if (cleanVal === '#ref!' || cleanVal === '-') return null;

        // Try split by space or hyphen
        const months = {
            'januari': 0, 'jan': 0,
            'februari': 1, 'feb': 1,
            'maret': 2, 'mar': 2,
            'april': 3, 'apr': 3,
            'mei': 4,
            'juni': 5, 'jun': 5,
            'juli': 6, 'jul': 6,
            'agustus': 7, 'agu': 7, 'ags': 7,
            'september': 8, 'sep': 8,
            'oktober': 9, 'okt': 9,
            'november': 10, 'nov': 10,
            'desember': 11, 'des': 11
        };
        
        const parts = cleanVal.split(/[\s\-]+/);
        if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const year = parseInt(parts[2]);
            let month = parseInt(parts[1]) - 1; // 1-indexed to 0-indexed
            if (isNaN(month)) {
                month = months[parts[1]];
            }
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return new Date(year, month, day);
            }
        }
        
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

// Map package based on total bayar and duration
function mapPackage(totalBayar, durasi, dbPackages) {
    const bayar = parseFloat(totalBayar) || 0;
    const dur = parseInt(durasi) || 0;

    // First try matching both price and duration
    let match = dbPackages.find(p => Math.abs(parseFloat(p.price) - bayar) < 1000 && p.duration.includes(String(dur)));
    if (match) return match.id;

    // Second try matching price
    match = dbPackages.find(p => Math.abs(parseFloat(p.price) - bayar) < 1000);
    if (match) return match.id;

    // Third try matching duration
    match = dbPackages.find(p => p.duration.includes(String(dur)));
    if (match) return match.id;

    // Default to Custom package (ID 7)
    return 7;
}

// Map Excel status to DB status
function mapStatus(excelStatus) {
    const status = String(excelStatus || '').trim().toLowerCase();
    if (status.includes('aktif') && !status.includes('tidak')) {
        return 'Aktif';
    }
    if (status.includes('tidak aktif') || status.includes('selesai')) {
        return 'Selesai';
    }
    if (status.includes('baru')) {
        return 'baru';
    }
    return 'pending';
}

async function run() {
    console.log(`====================================================`);
    console.log(`EXCEL TO DB SYNCHRONIZATION SCRIPT`);
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulasi)' : 'WRITE (Menulis ke DB)'}`);
    console.log(`Excel file: ${excelPath}`);
    console.log(`====================================================`);

    if (!fs.existsSync(excelPath)) {
        console.error(`Error: Excel file not found at: ${excelPath}`);
        process.exit(1);
    }

    // Connect to DB
    const dbUrl = process.env.MYSQL_URL || 'mysql://nyaladigitaldb:passwordku@127.0.0.1:3306/dbnyaladigital';
    const conn = await mysql.createConnection(dbUrl);

    try {
        // Load data from DB
        const [dbPackages] = await conn.query('SELECT id, name, price, duration FROM packages');
        const [dbClients] = await conn.query('SELECT id, name, business_name, whatsapp FROM clients');
        const [dbCampaigns] = await conn.query('SELECT id, order_id, client_id, campaign_id, campaign_name FROM campaigns');
        const [dbOrders] = await conn.query('SELECT id, client_id, status, meta_data, created_at FROM orders');

        console.log(`Loaded ${dbPackages.length} packages, ${dbClients.length} clients, ${dbOrders.length} orders, and ${dbCampaigns.length} campaigns from DB.`);

        // Indexes for fast lookup
        const clientByPhone = new Map();
        const clientByName = new Map();
        dbClients.forEach(c => {
            if (c.whatsapp) {
                clientByPhone.set(normalizePhone(c.whatsapp), c);
            }
            if (c.name) {
                clientByName.set(c.name.toLowerCase().trim(), c);
            }
        });

        const campaignByName = new Map();
        dbCampaigns.forEach(c => {
            if (c.campaign_name) {
                campaignByName.set(c.campaign_name.toLowerCase().trim(), c);
            }
        });

        const ordersMap = new Map();
        dbOrders.forEach(o => {
            ordersMap.set(o.id, o);
        });

        // Load Excel
        const workbook = xlsx.readFile(excelPath);
        const sheet = workbook.Sheets['Data Order'];
        const excelRows = xlsx.utils.sheet_to_json(sheet);
        console.log(`Excel rows count: ${excelRows.length}`);

        // Statistics
        let stats = {
            skipped: 0,
            matchedByCampaignName: 0,
            matchedByPhone: 0,
            matchedByName: 0,
            newClientAndOrder: 0,
            newOrderExistingClient: 0,
            updatesPerformed: 0,
            errors: 0
        };

        for (let i = 0; i < excelRows.length; i++) {
            const row = excelRows[i];
            const name = String(row['Nama'] || '').trim();
            const businessName = String(row['Nama Usaha'] || '').trim();
            const phone = row['No Whatsapp Bisnis'] ? String(row['No Whatsapp Bisnis']).trim() : '';

            // Skip dummy rows
            if (!name || name.toLowerCase() === 'dummy' || (!phone && !businessName)) {
                stats.skipped++;
                continue;
            }

            const parsedDate = parseExcelDate(row['Tanggal']) || new Date();
            const normPhone = normalizePhone(phone);
            const excelCampaignName = String(row['Campaign Name'] || '').trim();
            const excelCampaignId = String(row['KampanyeId'] || row['Kampanye ID'] || '').trim();

            let matchedClientId = null;
            let matchedOrderId = null;
            let matchType = '';

            // 1. Try match by Campaign Name
            if (excelCampaignName && campaignByName.has(excelCampaignName.toLowerCase())) {
                const c = campaignByName.get(excelCampaignName.toLowerCase());
                matchedClientId = c.client_id;
                matchedOrderId = c.order_id;
                matchType = 'campaign_name';
                stats.matchedByCampaignName++;
            }

            // 2. Try match by Phone Number
            if (!matchedClientId && normPhone && clientByPhone.has(normPhone)) {
                const c = clientByPhone.get(normPhone);
                matchedClientId = c.id;
                matchType = 'phone';
                stats.matchedByPhone++;
            }

            // 3. Try match by Client Name
            if (!matchedClientId && name && clientByName.has(name.toLowerCase())) {
                const c = clientByName.get(name.toLowerCase());
                matchedClientId = c.id;
                matchType = 'name';
                stats.matchedByName++;
            }

            // If client matched but order not resolved, search closest order by date
            if (matchedClientId && !matchedOrderId) {
                // Find all orders for this client
                const clientOrders = dbOrders.filter(o => o.client_id === matchedClientId);
                if (clientOrders.length === 1) {
                    matchedOrderId = clientOrders[0].id;
                } else if (clientOrders.length > 1) {
                    // Find closest order within 14 days
                    let closestOrder = null;
                    let minDiff = Infinity;
                    clientOrders.forEach(o => {
                        const dbDate = o.created_at ? new Date(o.created_at) : null;
                        if (dbDate) {
                            const diff = Math.abs(dbDate - parsedDate) / (1000 * 60 * 60 * 24); // diff in days
                            if (diff < minDiff && diff <= 14) {
                                minDiff = diff;
                                closestOrder = o;
                            }
                        }
                    });
                    if (closestOrder) {
                        matchedOrderId = closestOrder.id;
                    }
                }
            }

            // Determine Action
            let actionType = '';
            if (matchedClientId && matchedOrderId) {
                actionType = 'update_order';
            } else if (matchedClientId && !matchedOrderId) {
                actionType = 'create_order_for_client';
                stats.newOrderExistingClient++;
            } else {
                actionType = 'create_client_and_order';
                stats.newClientAndOrder++;
            }

            // Map packages & status
            const pkgId = mapPackage(row['Total Bayar'], row['Durasi'], dbPackages);
            const dbStatus = mapStatus(row['/']);

            // Prepare order targeting
            const lokasi = row['Lokasi'] ? String(row['Lokasi']).trim() : null;
            const usia = row['Usia'] ? String(row['Usia']).trim() : null;
            const jenisKelamin = row['Jenis Kelamin'] ? String(row['Jenis Kelamin']).trim() : null;

            if (isDryRun) {
                // Dry run logging
                if (actionType === 'update_order') {
                    console.log(`[DRY RUN] Row ${i+2}: Update Order ID ${matchedOrderId} for Client ID ${matchedClientId} (${businessName})`);
                } else if (actionType === 'create_order_for_client') {
                    console.log(`[DRY RUN] Row ${i+2}: Create new Order for existing Client ID ${matchedClientId} (${businessName})`);
                } else {
                    console.log(`[DRY RUN] Row ${i+2}: Create new Client & Order for "${name}" (${businessName})`);
                }
            } else {
                // Write mode execution
                try {
                    let client_id = matchedClientId;
                    let order_id = matchedOrderId;

                    // A. Create client if missing
                    if (actionType === 'create_client_and_order') {
                        const [res] = await conn.query(
                            'INSERT INTO clients (name, business_name, business_type, whatsapp, address, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                            [name, businessName || null, row['Jenis Usaha'] || null, normPhone || null, lokasi || null, parsedDate]
                        );
                        client_id = res.insertId;
                        console.log(`Inserted new Client ID ${client_id} for "${name}"`);
                        
                        // Add to local caches to prevent duplicate insertion
                        clientByPhone.set(normPhone, { id: client_id, name, business_name: businessName, whatsapp: normPhone });
                        clientByName.set(name.toLowerCase(), { id: client_id, name, business_name: businessName, whatsapp: normPhone });
                    }

                    // B. Create order if missing
                    if (actionType === 'create_client_and_order' || actionType === 'create_order_for_client') {
                        const metaObj = {
                            ads_platform: 'meta',
                            ads_objective: 'awareness',
                            ads_budget: String(row['Total Bayar'] || ''),
                            ads_duration: String(row['Durasi'] || ''),
                            cs_agent: row['CS'] || null,
                            advertiser: row['Advertiser'] || null,
                            fanspage: row['Fanspage'] || null,
                            ad_account_id: String(row['AccountId'] || '')
                        };

                        const [res] = await conn.query(
                            'INSERT INTO orders (client_id, package_id, status, service_type, meta_data, repeat_order, duration_months, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [client_id, pkgId, dbStatus, row['/'] || 'baru', JSON.stringify(metaObj), actionType === 'create_order_for_client' ? 1 : 0, parseInt(row['Durasi']) || null, parsedDate]
                        );
                        order_id = res.insertId;
                        console.log(`Inserted new Order ID ${order_id} for Client ID ${client_id}`);
                    }

                    // C. Update existing order metadata and targeting
                    if (actionType === 'update_order') {
                        // Fetch current order row to load metadata
                        const currentOrder = ordersMap.get(order_id);
                        let metaObj = {};
                        if (currentOrder && currentOrder.meta_data) {
                            try {
                                metaObj = JSON.parse(currentOrder.meta_data);
                            } catch (e) {
                                metaObj = {};
                            }
                        }

                        // Update metadata fields
                        metaObj.cs_agent = row['CS'] || metaObj.cs_agent || null;
                        metaObj.advertiser = row['Advertiser'] || metaObj.advertiser || null;
                        metaObj.fanspage = row['Fanspage'] || metaObj.fanspage || null;
                        metaObj.ad_account_id = String(row['AccountId'] || '') || metaObj.ad_account_id || null;

                        await conn.query(
                            'UPDATE orders SET meta_data = ?, status = ? WHERE id = ?',
                            [JSON.stringify(metaObj), dbStatus, order_id]
                        );
                        
                        stats.updatesPerformed++;
                    }

                    // D. Sync Targeting (order_targets)
                    if (lokasi || usia || jenisKelamin) {
                        // Check if order_targets already exists
                        const [targets] = await conn.query('SELECT id FROM order_targets WHERE order_id = ?', [order_id]);
                        if (targets.length > 0) {
                            await conn.query(
                                'UPDATE order_targets SET locations = ?, age_range = ?, gender = ? WHERE order_id = ?',
                                [lokasi, usia, jenisKelamin, order_id]
                            );
                        } else {
                            await conn.query(
                                'INSERT INTO order_targets (order_id, locations, age_range, gender) VALUES (?, ?, ?, ?)',
                                [order_id, lokasi, usia, jenisKelamin]
                            );
                        }
                    }

                    // E. Sync Campaigns (campaigns)
                    if (excelCampaignId || excelCampaignName) {
                        // Check if campaign already exists
                        let campMatch = null;
                        if (excelCampaignId) {
                            const [c] = await conn.query('SELECT id FROM campaigns WHERE campaign_id = ?', [excelCampaignId]);
                            if (c.length > 0) campMatch = c[0].id;
                        }
                        if (!campMatch && excelCampaignName) {
                            const [c] = await conn.query('SELECT id FROM campaigns WHERE campaign_name = ?', [excelCampaignName]);
                            if (c.length > 0) campMatch = c[0].id;
                        }

                        if (campMatch) {
                            await conn.query(
                                'UPDATE campaigns SET campaign_id = ?, campaign_name = ?, ad_account_id = ?, order_id = ?, client_id = ? WHERE id = ?',
                                [excelCampaignId || '', excelCampaignName || '', String(row['AccountId'] || ''), order_id, client_id, campMatch]
                            );
                        } else {
                            await conn.query(
                                'INSERT INTO campaigns (order_id, client_id, campaign_id, campaign_name, ad_account_id, status) VALUES (?, ?, ?, ?, ?, ?)',
                                [order_id, client_id, excelCampaignId || '', excelCampaignName || '', String(row['AccountId'] || ''), dbStatus === 'Aktif' ? 'ACTIVE' : 'PAUSED']
                            );
                        }
                    }

                } catch (err) {
                    console.error(`Error processing row ${i+2}:`, err);
                    stats.errors++;
                }
            }
        }

        console.log(`\n====================================================`);
        console.log(`SYNCHRONIZATION COMPLETED`);
        console.log(`====================================================`);
        console.log(`Skipped (Dummies/Empty): ${stats.skipped}`);
        console.log(`Matched by Campaign Name: ${stats.matchedByCampaignName}`);
        console.log(`Matched by WhatsApp: ${stats.matchedByPhone}`);
        console.log(`Matched by Client Name: ${stats.matchedByName}`);
        console.log(`New Clients and Orders to Create: ${stats.newClientAndOrder}`);
        console.log(`New Orders for Existing Clients: ${stats.newOrderExistingClient}`);
        console.log(`Updates Performed: ${stats.updatesPerformed}`);
        console.log(`Errors: ${stats.errors}`);
        console.log(`====================================================`);

    } catch (e) {
        console.error('Database connection error:', e);
    } finally {
        await conn.end();
    }
}

run();
