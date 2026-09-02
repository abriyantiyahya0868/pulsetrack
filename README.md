# ⚡ PulseTrack — Self-Hosted Web Analytics & Realtime Live Counter

> **PulseTrack** adalah sistem analitik web dan live counter mandiri (self-hosted) yang ultra-ringan (<3KB), modern, privacy-friendly, dan dirancang khusus agar dapat di-deploy secara **100% GRATIS** di **Cloudflare Pages + Cloudflare D1 Database** (atau server lokal Node.js / VPS).

---

## 🌟 Fitur Utama

- ⚡ **Ultra Ringan & Super Cepat**: Script `tracker.js` berukuran <3KB, asynchronous, tidak memperlambat loading website target.
- 🟢 **Realtime Active Visitors**: Indikator live counter pengunjung yang sedang online detik ini dengan animasi pulsing glow.
- 📻 **Live Counter Badges**: Tersedia widget badge SVG dinamis (Classic Retro, Modern Pill, Neon Cyberpunk, Minimalist) untuk dipasang di website Anda.
- 📊 **Dashboard Modern & Mewah**: Dark mode glassmorphism lengkap dengan grafik Chart.js, Top Pages, Top Referrers (Google, Medsos, Direct), Geolocation negara/kota otomatis, dan rincian perangkat/browser.
- 🌍 **Geolocation Otomatis**: Memanfaatkan Cloudflare Edge Headers (`cf-ipcountry`, `cf-ipcity`) tanpa perlu API pihak ketiga berbayar.
- 🏷️ **Multi-Website Support**: Bisa dipakai untuk memonitor banyak website sekaligus dalam satu dashboard.
- 🎯 **Custom Event Tracking**: Track klik tombol, checkout, download, klik link WhatsApp, dll.
- 💸 **100% Gratis Selamanya**: Berjalan di Cloudflare Pages Free Tier & D1 Database Free Tier (5 juta request/bulan gratis).

---

## 🚀 Panduan 1: Menjalankan di Komputer Lokal (Testing)

1. Pastikan Anda memiliki Node.js terinstall di komputer.
2. Buka terminal di folder project `c:\laragon\www\PulseTrack`:
   ```bash
   cd c:\laragon\www\PulseTrack
   npm install
   ```
3. Inisialisasi database lokal SQLite:
   ```bash
   node init-db.js
   ```
4. Jalankan server lokal:
   ```bash
   npm start
   ```
5. Buka di browser:
   - 📋 **PulseTrack Control Panel**: [http://localhost:3000/index.html](http://localhost:3000/index.html)
   - 📊 **Dashboard Analytics Detail**: [http://localhost:3000/dashboard.html](http://localhost:3000/dashboard.html)
   - 🎯 **Keyword Tracker**: [http://localhost:3000/keywords.html](http://localhost:3000/keywords.html)
   - 🔧 **Generator Kode Footer**: [http://localhost:3000/embed-generator.html](http://localhost:3000/embed-generator.html)
   - 🧪 **Halaman Uji Coba Demo**: [http://localhost:3000/demo.html](http://localhost:3000/demo.html)

---

## ☁️ Panduan 2: Deploy ke GitHub & Cloudflare Pages (100% GRATIS)

### Langkah A: Upload ke GitHub

1. Buat repository baru di [GitHub](https://github.com/new), beri nama misalnya `pulsetrack` atau `my-analytics`.
2. Buka terminal di folder project dan jalankan:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - PulseTrack Web Analytics"
   git branch -M main
   git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO_ANDA.git
   git push -u origin main
   ```

---

### Langkah B: Hubungkan ke Cloudflare Pages

1. Login ke [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Di menu kiri, buka **Workers & Pages** &rarr; **Create application** &rarr; tab **Pages** &rarr; **Connect to Git**.
3. Pilih repository GitHub yang baru saja dibuat.
4. Pada **Build settings**:
   - **Framework preset**: *None*
   - **Build command**: *(kosongkan)*
   - **Build output directory**: `public`
5. Klik **Save and Deploy**.

---

### Langkah C: Buat D1 Database di Cloudflare

1. Di menu kiri Cloudflare, klik **Workers & Pages** &rarr; **D1 SQL Database**.
2. Klik **Create database** &rarr; beri nama `pulsetrack-db` &rarr; klik **Create**.
3. Klik database tersebut &rarr; tab **Console** &rarr; salin dan jalankan query dari file `schema.sql`.

---

### Langkah D: Hubungkan Database D1 ke Cloudflare Pages

1. Kembali ke project Pages Anda di **Workers & Pages** &rarr; pilih project `PulseTrack`.
2. Buka menu **Settings** &rarr; **Functions** &rarr; scroll ke **D1 Database Bindings**.
3. Klik **Add binding**:
   - **Variable name**: `DB`
   - **D1 database**: pilih `pulsetrack-db`
4. Buka tab **Deployments** &rarr; klik tanda tiga titik di deployment terakhir &rarr; **Retry deployment** (agar binding aktif).
5. 🎉 **Selesai!** PulseTrack Anda kini aktif di URL domain Cloudflare Pages (contoh: `https://pulsetrack.pages.dev`).

---

## 🚀 Fitur Unggulan yang Sudah Aktif:

1. 🔐 **Multi-User Private Isolation** (`/login.html`): Antar user memiliki akun masing-masing dan tidak dapat melihat website/trafik user lain.
2. 📋 **PulseTrack Web List & Control Panel** (`/index.html`): Tampilan klasik PulseTrack dengan aksi lengkap (Add, Get Code, Stats, Hapus).
3. 🎯 **Global Keyword Tracker (Top 100 KW & Top 100 URLs)** (`/keywords.html`): Agregator kata kunci pencarian SEO dari Google/Bing/Yahoo dan 100 URL teramai di semua domain Anda.
4. 📊 **Dashboard Detail & Realtime Traffic** (`/dashboard.html`): Grafik time-series, negara, perangkat, browser, dan live visitor online feed.
5. 🏷️ **Live Counter Badge** (`/api/badge`): Widget badge counter SVG dinamis (Classic, Modern, Neon, Minimalist).
6. ⚡ **Ultra-lightweight Tracker Script** (`/tracker.js`): Berukuran <3KB, auto-detect domain, no-dependency, mendukung event kustom.

---

## 📋 Cara Memasang Tracker di Website Target

### 1. Pasang Script Tracker
Cukup tempelkan baris script berikut ke dalam tag `<head>` atau sebelum penutup `</body>` pada website yang ingin Anda monitor:

```html
<!-- PulseTrack Web Analytics -->
<script defer src="https://DOMAIN-CLOUDFLARE-ANDA.pages.dev/tracker.js" data-site-id="ID_WEBSITE_ANDA"></script>
```

### 2. Pasang Badge Live Counter
Jika ingin menampilkan kotak live counter jumlah pengunjung online & total traffic di website Anda:

```html
<!-- Live Counter Badge -->
<a href="https://DOMAIN-CLOUDFLARE-ANDA.pages.dev" target="_blank" title="Live Traffic Counter">
  <img src="https://DOMAIN-CLOUDFLARE-ANDA.pages.dev/api/badge?site_id=ID_WEBSITE_ANDA&theme=modern" alt="Live Stats" />
</a>
```

Pilihan tema badge (`theme=`):
- `modern` (Pill gradient modern & live dot)
- `classic` (Classic retro style 3-tier box)
- `neon` (Cyberpunk glowing green)
- `minimal` (Ultra compact bar)

---

## 📁 Struktur File Project

```
PulseTrack/
├── functions/                     # Backend Serverless API (Cloudflare Pages Functions)
│   ├── _middleware.js            # CORS & Security headers
│   └── api/
│       ├── collect.js            # Ingestion endpoint tracker
│       ├── stats.js              # Query agregasi analytics
│       ├── realtime.js           # Live online visitors stream
│       ├── sites.js              # Site management CRUD
│       └── badge.js              # Dynamic SVG live badge generator
├── public/                       # Frontend UI & Static Assets
│   ├── index.html                # Main Analytics Dashboard
│   ├── embed-generator.html      # Widget & Snippet Code Generator
│   ├── demo.html                 # Test Target Page
│   ├── tracker.js                # Client Tracker Script (<3KB)
│   ├── css/
│   │   └── dashboard.css         # Dark glassmorphism theme
│   └── js/
│       └── app.js                # Realtime dashboard logic & Chart.js
├── schema.sql                    # SQL Schema untuk Cloudflare D1 & SQLite
├── wrangler.toml                 # Config Cloudflare Pages
├── server.js                     # Local Development Server (Express + SQLite)
├── init-db.js                    # Database seeder untuk pengujian lokal
└── package.json
```

---

## 🛡️ Lisensi
MIT License — Bebas digunakan dan dimodifikasi untuk kebutuhan pribadi maupun komersial.
