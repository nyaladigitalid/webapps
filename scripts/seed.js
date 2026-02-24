const dotenv = require('dotenv');
dotenv.config();
const mysql = require('mysql2/promise');

function nowPlusDays(d) {
  const t = new Date();
  t.setDate(t.getDate() + d);
  const s = t.toISOString().slice(0, 19).replace('T', ' ');
  return s;
}

async function run() {
  const url = process.env.MYSQL_URL;
  if (!url) {
    console.error('MYSQL_URL not set');
    process.exit(1);
  }
  const conn = await mysql.createConnection(url);
  try {
    await conn.beginTransaction();

    const exec = async (sql, params) => {
      const [res] = await conn.execute(sql, params);
      return res;
    };

    const u1 = await exec(
      'INSERT INTO users (name,email,role,password_hash) VALUES (?,?,?,?)',
      ['Admin Nyala', 'admin@nyala.local', 'admin', null]
    );
    const u2 = await exec(
      'INSERT INTO users (name,email,role,password_hash) VALUES (?,?,?,?)',
      ['Operator Satu', 'ops1@nyala.local', 'operator', null]
    );

    const c1 = await exec(
      'INSERT INTO clients (name,business_name,business_type,whatsapp,address) VALUES (?,?,?,?,?)',
      ['Bakso Mang Ucup', 'Bakso Ucup', 'F&B', '628123456789', 'Jl. Merdeka No. 10, Bandung']
    );
    const c2 = await exec(
      'INSERT INTO clients (name,business_name,business_type,whatsapp,address) VALUES (?,?,?,?,?)',
      ['Green Kitchen', 'Green Kitchen', 'Catering', '628987654321', 'Jl. Melati No. 5, Jakarta']
    );

    const p1 = await exec(
      'INSERT INTO packages (code,name,price_monthly,description,active) VALUES (?,?,?,?,?)',
      ['PKT-SOCIAL', 'Social Media Ads', 1500000, 'Kampanye iklan di Meta/TikTok', 1]
    );
    const p2 = await exec(
      'INSERT INTO packages (code,name,price_monthly,description,active) VALUES (?,?,?,?,?)',
      ['PKT-SEO', 'SEO Booster', 1200000, 'Optimasi SEO bulanan', 1]
    );

    const o1 = await exec(
      'INSERT INTO orders (client_id,package_id,status,repeat_order,last_order_at,duration_months,start_date,end_date,progress_percent,days_remaining,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [c1.insertId, p1.insertId, 'active', 1, nowPlusDays(-7), 3, nowPlusDays(-7), nowPlusDays(83), 35, 83, 'Kampanye bakso spesial']
    );
    const o2 = await exec(
      'INSERT INTO orders (client_id,package_id,status,repeat_order,last_order_at,duration_months,start_date,end_date,progress_percent,days_remaining,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [c2.insertId, p2.insertId, 'draft', 0, null, 1, nowPlusDays(0), nowPlusDays(30), 10, 30, 'Setup awal SEO']
    );

    await exec(
      'INSERT INTO order_details (order_id,description,advantages,uniqueness,promo) VALUES (?,?,?,?,?)',
      [o1.insertId, 'Video pendek testimoni pelanggan', 'Kuah kental, bakso urat', 'Resep turun temurun', 'Diskon 10% pembukaan']
    );
    await exec(
      'INSERT INTO order_details (order_id,description,advantages,uniqueness,promo) VALUES (?,?,?,?,?)',
      [o2.insertId, 'Optimasi on-page dan backlink awal', 'Keyword lokal', 'Konten hijau sehat', 'Gratis audit awal']
    );

    await exec(
      'INSERT INTO order_targets (order_id,locations,age_range,gender) VALUES (?,?,?,?)',
      [o1.insertId, 'Bandung; Cimahi', '18-45', 'all']
    );
    await exec(
      'INSERT INTO order_targets (order_id,locations,age_range,gender) VALUES (?,?,?,?)',
      [o2.insertId, 'Jakarta Selatan; Depok', '21-40', 'female']
    );

    await exec(
      'INSERT INTO payments (order_id,total,method,status) VALUES (?,?,?,?)',
      [o1.insertId, 1500000, 'transfer_bca', 'paid']
    );
    await exec(
      'INSERT INTO payments (order_id,total,method,status) VALUES (?,?,?,?)',
      [o2.insertId, 1200000, 'qris', 'pending']
    );

    await exec(
      'INSERT INTO transactions (order_id,client_id,type,amount,note) VALUES (?,?,?,?,?)',
      [o1.insertId, c1.insertId, 'income', 1500000, 'DP 100% Social Media Ads']
    );
    await exec(
      'INSERT INTO transactions (order_id,client_id,type,amount,note) VALUES (?,?,?,?,?)',
      [o2.insertId, c2.insertId, 'income', 600000, 'DP 50% SEO Booster']
    );

    await exec(
      'INSERT INTO crm_activities (client_id,order_id,type,note,next_action_at) VALUES (?,?,?,?,?)',
      [c1.insertId, o1.insertId, 'follow_up', 'Minta materi foto tambahan', nowPlusDays(2)]
    );
    await exec(
      'INSERT INTO crm_activities (client_id,order_id,type,note,next_action_at) VALUES (?,?,?,?,?)',
      [c2.insertId, o2.insertId, 'call', 'Konfirmasi kata kunci target', nowPlusDays(1)]
    );

    await exec(
      'INSERT INTO audit_logs (user_id,action,entity,entity_id,meta) VALUES (?,?,?,?,?)',
      [u1.insertId, 'create', 'orders', o1.insertId, 'seed']
    );
    await exec(
      'INSERT INTO audit_logs (user_id,action,entity,entity_id,meta) VALUES (?,?,?,?,?)',
      [u2.insertId, 'update', 'clients', c2.insertId, 'seed']
    );

    await conn.commit();
    const [dbNameRows] = await conn.query('SELECT DATABASE() AS db');
    const dbName = dbNameRows && dbNameRows[0] ? dbNameRows[0].db : '(unknown)';
    const tables = ['users','clients','packages','orders','order_details','order_targets','payments','transactions','crm_activities','audit_logs'];
    const counts = {};
    for (const t of tables) {
      const [rows] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``);
      counts[t] = rows[0].cnt;
    }
    console.log('Seeding completed for database:', dbName);
    console.log('Row counts:', counts);
  } catch (e) {
    await conn.rollback();
    console.error('Seeding failed:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
