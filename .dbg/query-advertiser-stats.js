require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
(async () => {
  const pool = await mysql.createPool(process.env.MYSQL_URL || process.env.DATABASE_URL);
  const [rows] = await pool.query(`
    SELECT u.id,u.name,u.role,
      COALESCE(SUM(CASE WHEN LOWER(oc.status)='siap iklan' THEN 1 ELSE 0 END),0) AS siap_iklan,
      COALESCE(SUM(CASE WHEN LOWER(oc.status)='iklan tayang' THEN 1 ELSE 0 END),0) AS iklan_tayang,
      COALESCE(SUM(CASE WHEN LOWER(oc.status)='iklan tayang' THEN oa.commission_amount ELSE 0 END),0) AS komisi_tayang
    FROM users u
    LEFT JOIN order_assignments oa ON oa.user_id=u.id AND oa.role='Advertiser'
    LEFT JOIN order_contents oc ON oc.order_id=oa.order_id
    WHERE LOWER(u.role)='advertiser'
    GROUP BY u.id,u.name,u.role
    ORDER BY u.id
  `);
  fs.writeFileSync('.dbg\\advertiser-user-stats.json', JSON.stringify(rows, null, 2));
  await pool.end();
})().catch(async (err) => {
  fs.writeFileSync('.dbg\\advertiser-user-stats.json', JSON.stringify({ error: String(err), stack: err && err.stack }, null, 2));
  process.exit(1);
});
