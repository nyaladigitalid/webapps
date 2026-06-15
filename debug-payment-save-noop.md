# [OPEN] Debug Session: payment-save-noop

## Ringkasan Masalah
- Gejala: tombol `Simpan` pada panel `Status Pembayaran` di `orderdetail.html` diklik tetapi terlihat belum melakukan apa-apa.
- Ekspektasi: saat klik `Simpan`, status pembayaran berubah atau minimal muncul feedback error/sukses yang jelas.

## Hipotesis
1. Event `savePaymentStatus()` tidak terpanggil.
2. Request ke endpoint `/api/orders/:id/payment-status` gagal di runtime.
3. Endpoint backend belum termuat karena server belum restart.
4. Response backend sukses tetapi state/UI tidak ikut ter-update.
5. Ada error JavaScript lain yang menghentikan alur sebelum/selesai fetch.

## Rencana Bukti
- Tambah instrumentation minimal pada klik tombol dan sebelum/sesudah fetch.
- Tambah instrumentation minimal pada endpoint backend pembayaran.
- Jalankan ulang server dan minta reproduksi.
- Bandingkan log pre-fix dan post-fix sebelum menyentuh logic bisnis.
