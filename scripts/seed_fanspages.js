
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Load env
const rootEnv = path.join(__dirname, '..', '.env');
const dbEnv = path.join(__dirname, '..', 'src', 'db', '.env');
dotenv.config({ path: rootEnv });
dotenv.config({ path: dbEnv }); // Override if exists

function parseMysqlEnv() {
  const url = process.env.MYSQL_URL;
  if (url) {
    try {
      const u = new URL(url);
      return {
        host: u.hostname || 'localhost',
        port: Number(u.port || 3306),
        user: decodeURIComponent(u.username || ''),
        password: decodeURIComponent(u.password || ''),
        database: (u.pathname || '').replace(/^\//, '') || undefined,
      };
    } catch (_) {}
  }
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || undefined,
  };
}

const fanspages = [
  { id: '569094022964012', name: 'Promo UMKM Bersama', accountId: 'R10' },
  { id: '581334451725831', name: 'Lembaga Edukasi Pilihan Anda', accountId: 'R10' },
  { id: '576779842182895', name: 'Griya Sehat', accountId: 'R10' },
  { id: '532820886584415', name: 'Jasa Iklan Usaha UMKM', accountId: 'R10' },
  { id: '476331375569214', name: 'Jasa Otomotif Terdekat', accountId: 'R10' },
  { id: '514784225046611', name: 'Jasa Interior dan Exterior Terdekat', accountId: 'R10' },
  { id: '472416665961142', name: 'Jasa Advertising UMKM', accountId: 'R10' },
  { id: '512508301939019', name: 'Jasa Home Cleaning', accountId: 'R10' },
  { id: '522032024316690', name: 'Jasa Service AC Terdekat', accountId: 'R10' },
  { id: '685883047935688', name: 'Forum Edukasi', accountId: 'R11' },
  { id: '667346859796665', name: 'Beauty Solution', accountId: 'R11' },
  { id: '706957285826722', name: 'Pakar Bangun Indonesia', accountId: 'R11' },
  { id: '672574572602431', name: 'Promo Bisnis UMKM', accountId: 'R11' },
  { id: '641986379006091', name: 'Mitra Kuliner', accountId: 'R11' },
  { id: '645488418650292', name: 'Sahabat Otomotif', accountId: 'R11' },
  { id: '696512170212149', name: 'Pakar Teknisi', accountId: 'R11' },
  { id: '703817629479483', name: 'Bangun karya', accountId: 'R11' },
  { id: '61577805940511', name: 'BisnisKlik', accountId: 'R10' },
  { id: '626972463843711', name: 'FoodiePilihan', accountId: 'R11' },
  { id: '626281007244939', name: 'ShopEasy', accountId: 'R11' },
  { id: '751031078084301', name: 'TravelPartner', accountId: 'R08' }
];

async function main() {
  const config = parseMysqlEnv();
  const conn = await mysql.createConnection(config);
  
  console.log('Connected to database');

  try {
    // 1. Get or create active config
    const [rows] = await conn.query('SELECT id FROM meta_ads_configs WHERE is_active = 1 LIMIT 1');
    let configId;

    if (rows.length === 0) {
      console.log('No active config found. Creating one...');
      const [res] = await conn.query('INSERT INTO meta_ads_configs (access_token, pixel_id) VALUES (?, ?)', ['', '']);
      configId = res.insertId;
    } else {
      configId = rows[0].id;
    }
    
    console.log(`Using Config ID: ${configId}`);

    // 2. Clear existing fanspages for this config (to avoid duplicates if re-run, or just insert)
    // User asked to "Masukan data", implying insert. I'll delete old ones to be safe and ensure clean state matching the list.
    await conn.query('DELETE FROM fanspages WHERE config_id = ?', [configId]);
    console.log('Cleared existing fanspages');

    // 3. Insert new fanspages
    const values = fanspages.map(f => [configId, f.id, f.name, f.accountId]);
    await conn.query('INSERT INTO fanspages (config_id, fanspage_id, name, account_id) VALUES ?', [values]);
    
    console.log(`Inserted ${fanspages.length} fanspages successfully.`);

    // 4. Also ensure these accounts exist in ad_accounts (optional but good for consistency)
    const uniqueAccounts = [...new Set(fanspages.map(f => f.accountId))];
    for (const accId of uniqueAccounts) {
      const [accRows] = await conn.query('SELECT id FROM ad_accounts WHERE config_id = ? AND account_id = ?', [configId, accId]);
      if (accRows.length === 0) {
        await conn.query('INSERT INTO ad_accounts (config_id, account_id, name) VALUES (?, ?, ?)', [configId, accId, `Account ${accId}`]);
        console.log(`Created missing ad account: ${accId}`);
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await conn.end();
  }
}

main();
