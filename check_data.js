const mysql = require('mysql2/promise');

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      user: 'nyaladigitaldb',
      password: 'passwordku',
      database: 'nyaladigitaldb'
    });
    
    console.log('Connected to database.');

    const [metaConfigs] = await connection.query('SELECT COUNT(*) as count FROM meta_ads_configs');
    console.log('meta_ads_configs count:', metaConfigs[0].count);
    
    const [adAccounts] = await connection.query('SELECT COUNT(*) as count FROM ad_accounts');
    console.log('ad_accounts count:', adAccounts[0].count);
    
    const [fanspages] = await connection.query('SELECT COUNT(*) as count FROM fanspages');
    console.log('fanspages count:', fanspages[0].count);

    if (metaConfigs[0].count > 0) {
        const [config] = await connection.query('SELECT * FROM meta_ads_configs LIMIT 1');
        console.log('Sample meta_ads_config:', config[0]);
    }

    await connection.end();
  } catch (err) {
    console.error('Error:', err);
  }
})();