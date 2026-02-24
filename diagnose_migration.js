
require('dotenv').config();
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const path = require('path');

async function diagnose() {
    console.log('Starting diagnosis...');
    
    // 1. Database Connection
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
        // 2. Count DB Records
        const [ordersCount] = await connection.query('SELECT COUNT(*) as count FROM orders');
        const [campaignsCount] = await connection.query('SELECT COUNT(*) as count FROM campaigns');
        const [clientsCount] = await connection.query('SELECT COUNT(*) as count FROM clients');
        
        console.log('Database Counts:');
        console.log(`- Orders: ${ordersCount[0].count}`);
        console.log(`- Campaigns: ${campaignsCount[0].count}`);
        console.log(`- Clients: ${clientsCount[0].count}`);
        
        // 3. Analyze Excel
        const filePath = path.join(__dirname, 'data', 'DataKlien.xlsx');
        console.log(`Reading Excel: ${filePath}`);
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        console.log(`Total rows in Excel (including header): ${data.length}`);
        
        // Check for rows with Campaign ID but missing in DB
        let rowsWithCampaign = 0;
        let campaignIdsInExcel = new Set();
        
        // Column mapping (approximate from previous script)
        // We need to handle the shift logic too, but for rough count, let's look at raw values
        // Campaign ID is usually around index 27
        
        const idx = {
            ID: 2,
            KampanyeId: 27
        };
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            // Simple shift detection
            let currentIdx = { ...idx };
             if (row[1] && String(row[1]).startsWith('ORD-')) {
                 // Shifted
                 currentIdx.ID = 1;
                 currentIdx.KampanyeId = 26;
             }
             
             const campId = row[currentIdx.KampanyeId];
             if (campId && campId !== '#REF!' && String(campId).trim() !== '') {
                 rowsWithCampaign++;
                 campaignIdsInExcel.add(String(campId).trim());
             }
        }
        
        console.log(`Rows with valid Campaign ID in Excel: ${rowsWithCampaign}`);
        
        // 4. Sample check of missing campaigns
        // Get all campaign IDs from DB
        const [dbCampaigns] = await connection.query('SELECT campaign_id FROM campaigns');
        const dbCampaignIds = new Set(dbCampaigns.map(c => String(c.campaign_id).trim()));
        
        let missingInDb = 0;
        let missingSamples = [];
        
        campaignIdsInExcel.forEach(cid => {
            if (!dbCampaignIds.has(cid)) {
                missingInDb++;
                if (missingSamples.length < 5) missingSamples.push(cid);
            }
        });
        
        console.log(`Campaign IDs in Excel but MISSING in DB: ${missingInDb}`);
        if (missingSamples.length > 0) {
            console.log('Sample missing Campaign IDs:', missingSamples);
        }

    } catch (err) {
        console.error('Diagnosis failed:', err);
    } finally {
        await connection.end();
    }
}

diagnose();
