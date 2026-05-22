# TRAE Prompt — Tambah Fitur Simulator Latihan CS ke Proyek NyalaDigital

## Konteks Proyek

Ini adalah aplikasi internal NyalaDigital, sebuah agensi iklan Meta untuk kontraktor. Tech stack:
- **Backend**: Node.js + Express (`server.js`)
- **Database**: MySQL dengan Drizzle ORM
- **Frontend**: HTML vanilla + Tailwind CSS (CDN) + Material Symbols icon
- **Auth**: Session/token based, sudah ada di `js/include.js`
- **Pattern file**: Semua halaman adalah `.html` standalone di root folder
- **Sidebar navigasi**: Partial di `partials/sidebar.html`, di-include via `js/include.js`
- **Tema**: `html.theme-openai`, dark glass panel sidebar, light content area

---

## Tugas

Buat halaman baru `simulator-cs.html` dan tambahkan ke navigasi sidebar. Fitur ini adalah **simulator roleplay pelatihan CS** menggunakan OpenAI API, di mana AI berperan sebagai klien dan menilai jawaban CS secara real-time.

---

## Langkah 1 — Tambah menu di `partials/sidebar.html`

Tambahkan item menu baru setelah item `cprcalculator.html`. Ikuti persis pola yang sama:

```html
<a href="simulator-cs.html" data-menu="simulator_cs"
   class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-secondary/70 hover:bg-secondary/10 hover:text-white transition-colors">
  <span class="material-symbols-outlined text-[18px]">smart_toy</span>
  <span>Simulator CS</span>
</a>
```

---

## Langkah 2 — Buat file `simulator-cs.html`

Buat halaman baru dengan struktur yang sama persis dengan halaman lain di proyek ini (lihat referensi `clients.html` atau `kpi.html` untuk polanya). Gunakan:
- `<!DOCTYPE html>` dengan `class="theme-openai"`
- Include `js/include.js` dan Tailwind CDN
- Include Material Symbols font
- Include `partials/header.html` dan `partials/sidebar.html` via include.js
- Layout: sidebar kiri + konten utama kanan, sama seperti halaman lain

### Konten halaman `simulator-cs.html`

Halaman ini berisi simulator chat interaktif dengan fitur:

#### A. Header halaman
```
Judul: "Simulator Latihan CS"
Subtitle: "Latih skill closing dengan klien AI — dapatkan penilaian real-time setiap balasan"
```

#### B. Start Screen (tampil saat pertama buka)
- Deskripsi singkat cara kerja simulator
- Daftar 6 tipe persona klien yang bisa muncul (acak):
  1. Baru pertama mau coba iklan, skeptis & bingung
  2. Pernah ketipu agensi, trauma & waspada
  3. Sudah iklan sendiri di Meta, boncos, leads cuma tanya-tanya lalu diam
  4. Leads masuk tapi tidak convert ke closing
  5. Bisnis mau scaling, ragu iklan worth it
  6. Langsung tanya harga duluan, belum paham value
- Tombol **"Mulai Sesi"** yang memulai sesi baru dengan persona acak

#### C. Area Sesi Aktif (tampil setelah klik Mulai)

**Score bar** (4 metrik di atas):
- Skor rata-rata
- Skor terbaik
- Jumlah balasan
- Tahap saat ini (Identifikasi / Gali Masalah / Deliver Value / Negosiasi / Closing)

**Persona card**: tampilkan nama, deskripsi, dan badge tipe persona sesi ini

**Area chat**: bubble chat seperti WhatsApp
- Bubble kiri (abu-abu) = klien AI
- Bubble kanan (biru muda) = CS (user)
- Di bawah setiap bubble CS: inline score (nilai/100 + feedback 1 kalimat)
- Typing indicator (3 titik animasi) saat AI sedang memproses

**Input area**: textarea + tombol kirim. Enter = kirim, Shift+Enter = baris baru

**Tombol aksi**:
- "Akhiri & Lihat Ringkasan" → tampilkan summary lengkap
- "Sesi Baru" → kembali ke start screen

#### D. Summary Card (setelah akhiri sesi)
- Skor rata-rata besar + verdict (Lulus / Perlu Latihan Lagi / Belum Siap)
- Penilaian singkat 1 kalimat
- Daftar kekuatan (hijau, dengan icon centang)
- Daftar yang perlu diperbaiki (merah, dengan icon panah naik)
- Tips utama (kotak amber)
- Tombol "Coba Sesi Baru"

---

## Langkah 3 — Logic JavaScript dalam `simulator-cs.html`

### Konfigurasi OpenAI

```javascript
const OPENAI_API_KEY = 'ISI_API_KEY_OPENAI_DISINI'; // ganti dengan env atau config
const OPENAI_MODEL = 'gpt-4o-mini'; // atau gpt-4o sesuai kebutuhan
```

### Data Persona (6 tipe, dipilih acak tiap sesi)

```javascript
const PERSONAS = [
  {
    name: "Pak Rudi, kontraktor renovasi",
    desc: "Baru pertama kali mau coba iklan online. Skeptis tapi penasaran. Tidak paham teknis.",
    type: "Pertama kali iklan",
    fear: "Takut ribet, tidak paham cara kerja iklan online",
    opening: "Chat pertama ke agensi, penasaran tapi agak ragu"
  },
  {
    name: "Bu Sari, jasa bangun rumah",
    desc: "Pernah pakai agensi lain 3 bulan lalu. Bayar jutaan, leads nihil, agensi susah dihubungi. Masih trauma.",
    type: "Pernah ketipu agensi",
    fear: "Sangat waspada, butuh bukti nyata sebelum percaya",
    opening: "Datang dengan sikap skeptis karena pengalaman buruk sebelumnya"
  },
  {
    name: "Pak Ferdi, kontraktor cat & plester",
    desc: "Sudah 2 bulan pasang Meta Ads sendiri. Budget Rp800rb habis, leads yang masuk cuma tanya harga lalu diam. Boncos dan frustrasi.",
    type: "Boncos iklan sendiri",
    fear: "Sudah keluar uang tapi tidak ada hasil. Khawatir pakai jasa pun hasilnya sama saja.",
    opening: "Frustrasi soal iklan sendiri yang boncos dan leads tidak berkualitas"
  },
  {
    name: "Bu Wati, jasa kanopi aluminium",
    desc: "Dapat leads lumayan dari iklan tapi yang serius order sangat sedikit. Kebanyakan tanya harga lalu menghilang.",
    type: "Leads tidak convert",
    fear: "Buang waktu balas chat tidak serius. Tidak tahu cara filter leads berkualitas.",
    opening: "Curhat soal leads banyak tapi tidak ada yang closing"
  },
  {
    name: "Mas Hendra, kontraktor interior",
    desc: "Bisnis sudah jalan 3 tahun, proyek terus ada dari referral. Mau scale tapi belum yakin iklan digital worth it.",
    type: "Mau scaling",
    fear: "Ragu apakah iklan digital cocok untuk bisnis jasa bernilai besar",
    opening: "Penasaran tapi belum yakin, banyak tanya sebelum memutuskan"
  },
  {
    name: "Pak Doni, jasa renovasi dapur",
    desc: "Lihat iklan NyalaDigital di Facebook. Langsung tanya harga tanpa mau dengar penjelasan dulu.",
    type: "Price hunter",
    fear: "Cari yang paling murah, belum paham value iklan yang baik",
    opening: "Langsung tanya harga tanpa mau dengarkan penjelasan"
  }
];
```

### System Prompt untuk AI Klien

```javascript
function buildClientSystemPrompt(persona, history) {
  return `Kamu adalah simulator klien untuk pelatihan CS NyalaDigital, agensi iklan Meta khusus kontraktor.

PRODUK NYALADIGITAL:
- Paket Rp375.000 terima beres: video konten profesional, setup akun iklan Meta, iklan langsung ke WhatsApp, laporan harian, konsultasi advertiser, garansi leads, website kontraktor gratis, bonus template chat WhatsApp
- Tim 13 orang (5 advertiser, 2 editor konten, 4 CS, 2 admin laporan)
- Garansi: kalau leads tidak tercapai, iklan diperpanjang 2 hari gratis
- Proses: bisnis check dulu → produksi konten → setup iklan → tayang → laporan harian → evaluasi

PERSONA KAMU: ${persona.name}
LATAR BELAKANG: ${persona.desc}
TIPE: ${persona.type}
KEKHAWATIRAN UTAMA: ${persona.fear}
KONTEKS OPENING: ${persona.opening}

ATURAN BERMAIN PERSONA — WAJIB DIIKUTI:
1. Bicara natural seperti orang WhatsApp sungguhan — singkat, santai, informal
2. Tunjukkan kekhawatiran BERTAHAP, jangan buka semua sekaligus
3. Kalau CS langsung sebut harga atau jualan → jadi lebih dingin, jawab singkat
4. Kalau CS tanya close question yang tepat → mulai terbuka, cerita lebih detail
5. Kalau CS deliver value relevan dengan masalahmu → tunjukkan ketertarikan
6. Sesekali balik tanya atau minta klarifikasi
7. JANGAN langsung setuju beli — harus ada proses keraguan dulu
8. Maksimal 2-3 kalimat per balasan
9. JANGAN sebut bahwa kamu AI atau simulator
10. Untuk tipe boncos: ungkap frustrasi dulu, baru bisa terbuka soal solusi

HISTORI CHAT:
${history.map(h => `${h.role === 'client' ? persona.name : 'CS'}: ${h.content}`).join('\n')}`;
}
```

### System Prompt untuk AI Penilai

```javascript
function buildScoringPrompt(persona, history, csMsg) {
  return `Kamu adalah penilai ahli sales CS NyalaDigital, agensi iklan Meta untuk kontraktor.

PRINSIP SALES YANG DINILAI:
1. Value harus lebih tinggi dari harga — jangan sebut harga terlalu cepat
2. Identifikasi masalah dulu pakai close question sebelum kasih solusi
3. Deliver value yang relevan dengan kekhawatiran spesifik klien
4. Hindari bahasa negatif: nggak, jangan, maaf, tapi, hanya, tidak bisa
5. Setiap pesan diakhiri pertanyaan untuk jaga obrolan tetap hidup
6. Jangan kirim PDF/pricelist/promo di awal
7. Welcome message harus sederhana — perkenalan + 1 pertanyaan saja
8. Bonus dan promo disimpan sebagai amunisi closing, bukan diumbar di awal

PRODUK: Paket Rp375.000 — video iklan, setup akun, iklan ke WhatsApp, laporan harian, garansi leads, website gratis, template chat.

PERSONA KLIEN: ${persona.name} — ${persona.desc}
TIPE: ${persona.type}
KEKHAWATIRAN: ${persona.fear}

HISTORI CHAT (6 terakhir):
${history.slice(-6).map(h => `${h.role === 'client' ? persona.name : 'CS'}: ${h.content}`).join('\n')}

BALASAN CS YANG DINILAI: "${csMsg}"

Nilai 0-100. Jawab HANYA dengan JSON berikut, tanpa teks lain:
{"score":85,"feedback":"Satu kalimat feedback spesifik dan actionable","stage":"Identifikasi / Gali Masalah / Deliver Value / Negosiasi / Closing"}`;
}
```

### System Prompt untuk Summary Akhir

```javascript
function buildSummaryPrompt(persona, history, avgScore) {
  const chatText = history.map(h =>
    `${h.role === 'client' ? persona.name : 'CS'}: ${h.content}`
  ).join('\n');

  return `Kamu adalah pelatih sales senior NyalaDigital. Buat evaluasi sesi roleplay CS.

Persona klien: ${persona.name} (${persona.desc}). Tipe: ${persona.type}.

CHAT LENGKAP:
${chatText}

Skor rata-rata: ${avgScore}/100

Jawab HANYA dengan JSON berikut, tanpa teks lain:
{"overall":"Penilaian singkat 1 kalimat","strengths":["kekuatan spesifik 1","kekuatan spesifik 2"],"improvements":["perbaikan spesifik 1","perbaikan spesifik 2"],"tip":"Tips paling penting untuk sesi berikutnya","verdict":"Lulus / Perlu Latihan Lagi / Belum Siap"}`;
}
```

### Fungsi Panggil OpenAI API

```javascript
async function callOpenAI(systemPrompt, userMessage, maxTokens = 500) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
```

### Flow Utama

```javascript
// 1. Saat klik "Mulai Sesi"
async function startSession() {
  persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
  history = [];
  scores = [];
  sessionEnded = false;
  // Tampilkan main screen, reset UI
  // Panggil OpenAI untuk pesan pembuka klien
  const openingMsg = await callOpenAI(
    `Kamu klien: ${persona.name}. ${persona.desc}. Kekhawatiran: ${persona.fear}. Kirim pesan PERTAMA yang natural ke CS NyalaDigital. 1-2 kalimat saja, bahasa Indonesia santai seperti WhatsApp. JANGAN sebut harga. Hanya teks pesannya saja tanpa label apapun.`,
    'mulai',
    150
  );
  // Tampilkan bubble klien
  history.push({ role: 'client', content: openingMsg });
}

// 2. Saat CS kirim pesan
async function sendCSMessage() {
  const txt = inputEl.value.trim();
  if (!txt || sessionEnded) return;
  
  history.push({ role: 'cs', content: txt });
  
  // Panggil keduanya secara paralel
  const [scoreRaw, clientReply] = await Promise.all([
    callOpenAI('Kamu penilai sales.', buildScoringPrompt(persona, history, txt), 200),
    callOpenAI(buildClientSystemPrompt(persona, history), txt, 200)
  ]);
  
  // Parse score
  let scoreData = { score: 65, feedback: 'Lanjutkan identifikasi kebutuhan.', stage: 'Identifikasi' };
  try { scoreData = JSON.parse(scoreRaw.replace(/```json|```/g, '').trim()); } catch(e) {}
  
  scores.push(scoreData.score);
  // Update UI: tampilkan bubble CS dengan inline score, bubble klien, update score bar
  history.push({ role: 'client', content: clientReply });
}

// 3. Saat klik "Akhiri & Ringkasan"
async function endSession() {
  const avg = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
  const summaryRaw = await callOpenAI(
    'Kamu pelatih sales senior.',
    buildSummaryPrompt(persona, history, avg),
    400
  );
  // Parse dan tampilkan summary card
}
```

---

## Langkah 4 — Styling

Ikuti design system yang sudah ada di proyek:
- Gunakan Tailwind CSS utility classes
- Warna: sesuaikan dengan tema proyek (light/clean)
- Font: Inter (sudah di-include via Google Fonts)
- Icon: Material Symbols Outlined (sudah di-include)
- Bubble chat klien: `bg-gray-100 text-gray-800 rounded-xl rounded-tl-sm`
- Bubble chat CS: `bg-blue-50 text-blue-900 rounded-xl rounded-tr-sm`
- Score inline di bawah bubble CS: badge kecil dengan warna sesuai nilai (hijau ≥80, amber 60-79, merah <60)
- Typing indicator: 3 dot animasi bounce/blink
- Summary card: border rounded-xl dengan section terpisah untuk kekuatan dan perbaikan

---

## Langkah 5 — Keamanan API Key

**Penting**: Jangan hardcode API key di HTML yang bisa diakses publik.

Pilihan yang disarankan sesuai arsitektur proyek ini:

**Opsi A** (lebih aman — lewat server.js):
Tambahkan endpoint baru di `server.js`:
```javascript
app.post('/api/openai-proxy', requireAuth, async (req, res) => {
  const { systemPrompt, userMessage, maxTokens } = req.body;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens || 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });
  const data = await response.json();
  res.json(data);
});
```
Tambahkan `OPENAI_API_KEY=sk-...` ke file `.env`.
Di frontend, panggil `/api/openai-proxy` instead of OpenAI langsung.

**Opsi B** (cepat untuk testing):
Simpan API key di `localStorage` via input di halaman simulator, jangan hardcode di source code.

---

## Catatan Penting untuk TRAE

1. **Jangan ubah file lain** selain `partials/sidebar.html` dan file baru `simulator-cs.html`
2. **Ikuti pola include.js** yang sudah ada untuk load header, sidebar, dan auth check — lihat halaman `clients.html` sebagai referensi paling dekat
3. **Aktifkan menu di sidebar** dengan set `data-menu="simulator_cs"` agar active state bekerja otomatis
4. **Perhatikan auth check** — halaman ini hanya untuk user yang sudah login, ikuti pola yang sama dengan halaman lain
5. **Error handling**: tampilkan pesan yang friendly jika OpenAI API gagal, jangan biarkan UI freeze
6. **Mobile responsive**: pastikan layout chat tetap usable di layar kecil
7. **Parse JSON aman**: selalu wrap JSON.parse dalam try-catch karena AI kadang menambahkan teks di luar JSON
