# Panduan Deployment Aplikasi ke Server Ubuntu

Berikut adalah langkah-langkah lengkap untuk menginstal dan menjalankan aplikasi ini di server Ubuntu (misalnya DigitalOcean, AWS, Google Cloud, atau VPS lainnya).

## 1. Persiapan Server

Pastikan Anda memiliki akses SSH ke server Ubuntu Anda. Jalankan perintah berikut untuk memperbarui sistem:

```bash
sudo apt update
sudo apt upgrade -y
```

## 2. Install Node.js (Versi LTS)

Aplikasi ini menggunakan Node.js. Install versi LTS terbaru (misalnya v18 atau v20):

```bash
# Install curl jika belum ada
sudo apt install curl -y

# Tambahkan repository NodeSource (contoh untuk Node.js 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verifikasi instalasi
node -v
npm -v
```

## 3. Install MySQL Server

Aplikasi ini menggunakan database MySQL.

```bash
# Install MySQL Server
sudo apt install mysql-server -y

# Jalankan script keamanan (opsional tapi disarankan)
sudo mysql_secure_installation
```

Masuk ke MySQL untuk membuat database dan user:

```bash
sudo mysql
```

Di dalam prompt MySQL, jalankan perintah berikut (ganti `password_anda` dengan password yang kuat):

```sql
CREATE DATABASE nyala_db;
CREATE USER 'nyala_user'@'localhost' IDENTIFIED BY 'password_anda';
GRANT ALL PRIVILEGES ON nyala_db.* TO 'nyala_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 4. Setup Aplikasi

Anda bisa mengupload kode aplikasi ini ke server menggunakan `git` (jika repository ada di GitHub/GitLab) atau `scp`/SFTP. Asumsikan kita menaruhnya di folder `/var/www/nyala-web`.

```bash
# Buat direktori (jika belum ada)
sudo mkdir -p /var/www/nyala-web
sudo chown -R $USER:$USER /var/www/nyala-web

# Masuk ke direktori
cd /var/www/nyala-web

# Upload file aplikasi Anda ke sini...
# (Jika menggunakan git: git clone <url_repo> .)
```

Install dependensi aplikasi:

```bash
npm install
```

## 5. Konfigurasi Environment Variables

Salin file `.env` contoh dan sesuaikan dengan konfigurasi server Anda:

```bash
cp .env.example .env
nano .env
```

Edit bagian database sesuai yang Anda buat di langkah 3:

```env
MYSQL_HOST=localhost
MYSQL_USER=nyala_user
MYSQL_PASSWORD=password_anda
MYSQL_DATABASE=nyala_db
PORT=3000
```

Simpan dan keluar (Ctrl+X, Y, Enter).

## 6. Setup Database Schema

Jalankan migrasi database untuk membuat tabel-tabel yang diperlukan. Aplikasi ini menggunakan Drizzle ORM.

```bash
# Generate migrasi (jika perlu)
npm run db:generate

# Jalankan migrasi ke database
npm run db:migrate

# Jalankan seed data awal (jika ada)
npm run db:seed
```

*Catatan: Jika ada script setup khusus seperti `scripts/setup_scalev_table.js`, jalankan juga:*

```bash
node scripts/setup_scalev_table.js
```

## 7. Jalankan Aplikasi dengan PM2

PM2 adalah process manager untuk Node.js agar aplikasi tetap berjalan di background dan restart otomatis jika crash.

```bash
# Install PM2 secara global
sudo npm install -g pm2

# Jalankan aplikasi menggunakan file konfigurasi ecosystem.config.js yang sudah dibuat
pm2 start ecosystem.config.js --env production

# Simpan list proses PM2 agar otomatis jalan saat server restart
pm2 save
pm2 startup
```

Aplikasi sekarang berjalan di port 3000 (http://localhost:3000).

## 8. Setup Nginx sebagai Reverse Proxy

Agar aplikasi bisa diakses melalui domain (port 80/443) tanpa mengetik port 3000, gunakan Nginx.

```bash
# Install Nginx
sudo apt install nginx -y
```

Buat file konfigurasi untuk situs Anda:

```bash
sudo nano /etc/nginx/sites-available/nyala-web
```

Isi dengan konfigurasi berikut (ganti `domain-anda.com` dengan domain asli Anda):

```nginx
server {
    listen 80;
    server_name domain-anda.com www.domain-anda.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan konfigurasi dan restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/nyala-web /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 9. Setup HTTPS (SSL) dengan Certbot

Amankan aplikasi Anda dengan SSL gratis dari Let's Encrypt.

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Request sertifikat SSL
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com
```

Ikuti instruksi di layar. Certbot akan otomatis mengonfigurasi HTTPS untuk Nginx.

## Selesai!

Aplikasi Anda sekarang sudah online dan bisa diakses melalui `https://domain-anda.com`.

### Perintah Berguna Lainnya:

- **Cek Status Aplikasi**: `pm2 status`
- **Lihat Logs Aplikasi**: `pm2 logs nyala-web`
- **Restart Aplikasi**: `pm2 restart nyala-web`
- **Stop Aplikasi**: `pm2 stop nyala-web`
