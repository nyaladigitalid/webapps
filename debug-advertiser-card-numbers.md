[OPEN] Debug Session: advertiser-card-numbers

Symptoms:
- Angka card advertiser belum berubah setelah perubahan query dan label KPI.
- Screenshot masih menunjukkan label lama dan nilai yang tidak sesuai harapan.

Current Expectation:
- Card advertiser menampilkan:
  - `Siap Iklan`: jumlah order dengan `order_contents.status = 'Siap Iklan'`
  - `Iklan Tayang`: jumlah order dengan `order_contents.status = 'Iklan Tayang'`
  - `Komisi Advertiser`: total komisi advertiser dari order berstatus `Iklan Tayang`

Hypotheses:
1. Frontend masih memuat file `dashboard.html` versi lama, sehingga binding card masih memakai field lama (`monthlyAds`, `advertiserCommissionTotal`).
2. Backend endpoint `/api/dashboard/advertiser-stats` yang aktif di runtime belum memakai query terbaru karena proses server belum restart.
3. Query advertiser stats berjalan, tetapi data di database belum memiliki `order_contents.status = 'Iklan Tayang'`, sehingga count tetap `0`.
4. Frontend memanggil endpoint advertiser stats dengan `user_id` kosong atau berbeda dari advertiser login, sehingga hasil query tidak sesuai.
5. Ada mismatch antara data tabel advertiser dan KPI karena tabel memakai source `window.dashAllOrders`, sedangkan card memakai response endpoint stats yang formatnya berbeda.

Evidence Plan:
- Tambahkan instrumentation pada endpoint `/api/dashboard/advertiser-stats`
- Tambahkan instrumentation pada fungsi `loadAdvertiserData()`
- Jalankan ulang server, reproduce refresh dashboard advertiser, lalu bandingkan log runtime

Evidence Collected:
- Response live `dashboard.html` dari `localhost:3000` sudah memuat label baru `Iklan Tayang` dan field `tayangClients`.
- Response live `/api/dashboard/advertiser-stats?user_id=12` mengembalikan `{"readyClients":2,"tayangClients":0,"advertiserCommissionTayangTotal":"0.00"}`.
- Tabel advertiser di dashboard memuat data global `content_status=ready`, bukan data assignment advertiser per user.

Conclusion:
- Hypothesis 1: Ditolak. File frontend yang dilayani server sudah versi baru.
- Hypothesis 2: Ditolak. Endpoint runtime sudah versi baru.
- Hypothesis 3: Sebagian benar. Untuk advertiser `user_id=12`, data `Iklan Tayang` memang `0`.
- Hypothesis 4: Belum terbukti sebagai akar utama.
- Hypothesis 5: Dikonfirmasi. KPI advertiser sebelumnya dihitung per assignment user, sedangkan tabel advertiser memakai data global, sehingga angka tidak sinkron.
