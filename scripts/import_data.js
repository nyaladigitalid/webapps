const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const rootEnv = path.join(__dirname, '..', '.env');
dotenv.config({ path: rootEnv });

// Helper to parse date "DD-MMM-YYYY" to MySQL Date object
function parseDate(dateStr) {
  if (!dateStr) return null;
  const months = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };
  const parts = dateStr.split('-');
  if (parts.length !== 3) return new Date();
  const day = parseInt(parts[0], 10);
  const month = months[parts[1]];
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

// Data from the image
const data = [
  {
    tanggal: '18-May-2025',
    nama: 'ni luh sukasih',
    namaUsaha: 'LK spa n beauty',
    jenisUsaha: 'SPA',
    whatsapp: '6282341428767',
    deskripsi: 'profesional family Spa di Denpasar',
    lokasi: 'Bali',
    usia: '21 sampai 65',
    durasi: 14,
    total: 500000,
    cs: 'Devi'
  },
  {
    tanggal: '21-May-2025',
    nama: 'Veronika Da Costa',
    namaUsaha: 'Verrocosta',
    jenisUsaha: 'Kosmetik',
    whatsapp: '61459676831',
    deskripsi: '',
    lokasi: 'Bebonuk',
    usia: '17 th ke atas',
    durasi: 10,
    total: 375000,
    cs: 'Isna'
  },
  {
    tanggal: '22-May-2025',
    nama: 'Karyatukang87',
    namaUsaha: 'Karyatukang87',
    jenisUsaha: 'Furniture Interior',
    whatsapp: '628872305953',
    deskripsi: '',
    lokasi: 'semarang',
    usia: '21-65',
    durasi: 5,
    total: 197000,
    cs: 'Devi'
  },
  {
    tanggal: '22-May-2025',
    nama: 'Ni Luh Suparwati',
    namaUsaha: 'Glam Beauty Salon & Spa',
    jenisUsaha: 'Salon Kecantikan',
    whatsapp: '67076472864',
    deskripsi: '',
    lokasi: 'Seputaran Bali',
    usia: 'Semua Usia',
    durasi: 10,
    total: 375000,
    cs: 'Isna'
  },
  {
    tanggal: '22-May-2025',
    nama: 'Iwan',
    namaUsaha: 'Iwan Audio',
    jenisUsaha: 'Audio Mobil Eropa',
    whatsapp: '6285711307707',
    deskripsi: '',
    lokasi: 'seluruh indonesia',
    usia: '25 th ke atas',
    durasi: 5,
    total: 197000,
    cs: 'Isna'
  },
  {
    tanggal: '25-May-2025',
    nama: 'Vita',
    namaUsaha: 'Seblak Prasmanan Vita',
    jenisUsaha: 'Seblak Prasmana',
    whatsapp: '6285270469663',
    deskripsi: '',
    lokasi: 'lampahan',
    usia: 'bebas',
    durasi: 0,
    total: 50000,
    cs: 'Isna'
  },
  {
    tanggal: '25-May-2025',
    nama: 'Nur Musvita Ayu',
    namaUsaha: 'AR Salon',
    jenisUsaha: 'Salon',
    whatsapp: '6285757607630',
    deskripsi: '',
    lokasi: 'Makassar',
    usia: '18 th ke atas',
    durasi: 5,
    total: 197000,
    cs: 'Isna'
  },
  {
    tanggal: '25-May-2025',
    nama: 'Winda nainggolan',
    namaUsaha: 'Winda Tebus emas',
    jenisUsaha: 'Tebus emas',
    whatsapp: '62882015054720',
    deskripsi: '',
    lokasi: 'Medan dan prapat',
    usia: '',
    durasi: 5,
    total: 197000,
    cs: 'Devi'
  },
  {
    tanggal: '25-May-2025',
    nama: 'Juni meika',
    namaUsaha: 'zL beauty homecare',
    jenisUsaha: 'salon perawatan',
    whatsapp: '6281549409606',
    deskripsi: '',
    lokasi: 'smarinda',
    usia: 'Semua usia',
    durasi: 7,
    total: 297000,
    cs: 'Yuni'
  },
  {
    tanggal: '26-May-2025',
    nama: 'ramli',
    namaUsaha: 'Eny Laundry',
    jenisUsaha: 'Laundry karpet & sofa',
    whatsapp: '6283129638348',
    deskripsi: 'laundry karpet, pakaian, sofa',
    lokasi: 'lombok tengah',
    usia: '25ke atas',
    durasi: 5,
    total: 197000,
    cs: 'Yuni'
  },
  {
    tanggal: '28-May-2025',
    nama: 'Adi',
    namaUsaha: 'AJP ADI',
    jenisUsaha: 'PLAFON',
    whatsapp: '6283188945188',
    deskripsi: '',
    lokasi: 'Watukumpul',
    usia: '20-65',
    durasi: 5,
    total: 197000,
    cs: 'Isna'
  },
  {
    tanggal: '28-May-2025',
    nama: 'Yara',
    namaUsaha: 'M&Y mahkota salon & yoga',
    jenisUsaha: 'wedding dan salon kecantikan',
    whatsapp: '',
    deskripsi: 'wo wedding organizer juga',
    lokasi: 'kalimantan',
    usia: '15-60',
    durasi: 5,
    total: 197000,
    cs: 'Isna'
  },
  {
    tanggal: '29-May-2025',
    nama: 'Mira Cantika',
    namaUsaha: 'Mira Cantika Makeup',
    jenisUsaha: 'Makeup pengantin',
    whatsapp: '6285758792669',
    deskripsi: '',
    lokasi: 'Tebo , Bungo',
    usia: '18th ke atas',
    durasi: 5,
    total: 197000,
    cs: 'Devi'
  }
];

async function main() {
  let connection;
  try {
    let config = {
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT || 3306
    };

    if (process.env.MYSQL_URL) {
      try {
        const u = new URL(process.env.MYSQL_URL);
        config = {
          host: u.hostname || 'localhost',
          port: Number(u.port || 3306),
          user: decodeURIComponent(u.username || ''),
          password: decodeURIComponent(u.password || ''),
          database: (u.pathname || '').replace(/^\//, '') || undefined,
        };
      } catch (e) {
        console.error('Error parsing MYSQL_URL:', e);
      }
    }

    console.log('Connecting to database...');
    connection = await mysql.createConnection(config);

    console.log('Clearing existing data...');
    // Delete in order to avoid foreign key constraints
    await connection.execute('DELETE FROM payments');
    await connection.execute('DELETE FROM order_details');
    await connection.execute('DELETE FROM order_targets');
    await connection.execute('DELETE FROM orders');
    await connection.execute('DELETE FROM clients');
    
    // Reset auto-increment (optional, but good for clean state)
    try {
      await connection.execute('ALTER TABLE clients AUTO_INCREMENT = 1');
      await connection.execute('ALTER TABLE orders AUTO_INCREMENT = 1');
      await connection.execute('ALTER TABLE order_targets AUTO_INCREMENT = 1');
      await connection.execute('ALTER TABLE order_details AUTO_INCREMENT = 1');
      await connection.execute('ALTER TABLE payments AUTO_INCREMENT = 1');
    } catch (e) {
      console.log('Could not reset auto-increment, continuing...');
    }

    console.log('Inserting new data...');
    
    for (const item of data) {
      // 1. Insert Client
      const [clientResult] = await connection.execute(
        'INSERT INTO clients (name, business_name, business_type, whatsapp, address, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [item.nama, item.namaUsaha, item.jenisUsaha, item.whatsapp, item.lokasi, parseDate(item.tanggal)]
      );
      const clientId = clientResult.insertId;

      // 2. Insert Order
      // Use 'active' as default status
      const [orderResult] = await connection.execute(
        'INSERT INTO orders (client_id, status, duration_months, notes, created_at) VALUES (?, ?, ?, ?, ?)',
        [clientId, 'active', item.durasi, `CS: ${item.cs}`, parseDate(item.tanggal)]
      );
      const orderId = orderResult.insertId;

      // 3. Insert Order Details (if description exists)
      if (item.deskripsi) {
        await connection.execute(
          'INSERT INTO order_details (order_id, description) VALUES (?, ?)',
          [orderId, item.deskripsi]
        );
      }

      // 4. Insert Order Targets (Location and Age)
      if (item.lokasi || item.usia) {
        await connection.execute(
          'INSERT INTO order_targets (order_id, locations, age_range) VALUES (?, ?, ?)',
          [orderId, item.lokasi, item.usia]
        );
      }

      // 5. Insert Payment
      if (item.total) {
        await connection.execute(
          'INSERT INTO payments (order_id, total, method, status) VALUES (?, ?, ?, ?)',
          [orderId, item.total, 'Transfer', 'paid']
        );
      }
    }

    console.log('Data import completed successfully!');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (connection) await connection.end();
  }
}

main();
