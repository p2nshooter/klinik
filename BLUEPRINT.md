# BLUEPRINT — GLOBAL KLINIK
### Digital Clinic Platform + Sistem Informasi Manajemen Klinik (SIM Klinik)

> Dokumen induk proyek. Semua keputusan desain, arsitektur, modul, peran, dan status pengerjaan dicatat di sini.
> Setiap perubahan besar **wajib** memperbarui dokumen ini terlebih dulu, baru dikerjakan.

| Item | Nilai |
|---|---|
| Nama brand (sementara) | **Global Klinik** — *Care Without Borders* |
| Alamat sementara | `https://global-klinik.<subdomain-akun>.workers.dev` (Cloudflare Workers) |
| Aplikasi | Website publik (SSR, SEO) + Aplikasi PWA (bisa di-install di HP, tablet, laptop, PC) |
| Bahasa | Indonesia (default) & English |
| Tema | Light / Dark (otomatis mengikuti perangkat, bisa diganti manual) |
| Stempel penjualan | Beranda menampilkan stempel besar **"WEBSITE INI DIJUAL — Hubungi +62 856-9123-4561"** (bisa dimatikan / diubah di Admin → Pengaturan) |

---

## 1. Visi Produk

Bukan sekadar company profile, tetapi **platform klinik digital** yang lengkap:

```
Website Publik ─► Portal Pasien ─► Dashboard Dokter ─► Dashboard Admin/Manajemen
        │                 │                 │                     │
        └──────────── REST API (Cloudflare Worker) ────────────────┘
                              │
      ┌───────────────┬───────┴────────┬──────────────────┐
      D1 (transaksi)  KV (cache, sesi,  R2 (file, dokumen,  Integrasi eksternal
      SQL relasional   antrian, konten)  konten, backup)    WA · Email · Payment · SATU SEHAT
```

Prinsip:
1. **Profesional & premium** — tipografi elegan, palet teal–navy–emas, animasi halus.
2. **Mudah digunakan** — alur kerja per peran (pendaftaran, dokter, apotek, kasir), bukan menu teknis.
3. **Semua bisa di-CRUD dari Admin** — konten website, master data, transaksi, pengguna, peran.
4. **Hemat D1, maksimalkan KV & R2** — lihat §4.
5. **Aman** — hashing PBKDF2, sesi HttpOnly, 2FA TOTP, RBAC, audit log, rate limit, CSP.
6. **Siap tumbuh** — multi-cabang, API terbuka, modular; bisa pindah ke domain sendiri kapan saja.

---

## 2. Identitas Brand

| Elemen | Spesifikasi |
|---|---|
| Logo | Emblem bundar: **globe** (garis meridian) + **salib medis** berujung bulat, gradasi teal, cincin emas tipis. File: `public/assets/img/logo.svg`, `logo-mark.svg`, ikon PNG 192/512/maskable |
| Wordmark | "Global" (sans, tebal) + "Klinik" (serif elegan) |
| Warna utama | Teal `#0F766E` · Teal gelap `#0B4F4A` · Navy `#0B1F33` · Emas `#B8893B` · Latar `#F6F8F7` |
| Warna status | Sukses `#15803D` · Peringatan `#B45309` · Bahaya `#B91C1C` · Info `#1D4ED8` |
| Tipografi | **Plus Jakarta Sans** (UI & teks) + **Fraunces** (judul elegan) — Google Fonts |
| Gaya | Kartu lembut (radius 16–24px), bayangan halus, ikon garis 1.75px, ilustrasi SVG, gerak `ease-out` 200–600ms, hormati `prefers-reduced-motion` |

Gambar: default memakai ilustrasi SVG berkualitas tinggi (tajam di semua layar, ringan). Foto asli klinik/dokter
di-upload dari Admin → tersimpan di **R2** dan otomatis dipakai di website.

---

## 3. Arsitektur Teknis

### 3.1 Stack Fase 1 (sedang berjalan)
| Lapisan | Teknologi | Alasan |
|---|---|---|
| Hosting & API | **Cloudflare Worker** tunggal (`src/index.js`) | Global edge, gratis/murah, tanpa server |
| Website publik | **SSR** (HTML dirender di Worker) dari konten CMS | SEO penuh, cepat, dinamis |
| Aplikasi (Admin/Dokter/Pasien/dll) | **PWA SPA** tanpa framework berat (ES Modules) di `public/app` | Ringan, bisa di-install, offline shell |
| Aset statis | Workers Static Assets (`public/`) | Gratis, tidak memakai D1/KV |
| Database transaksi | **D1** (SQLite) | Relasional untuk pasien, kunjungan, ERM, billing, stok |
| Cache, sesi, antrian, konten publik | **KV** | Baca super cepat di edge |
| Konten CMS (sumber kebenaran), file, dokumen PDF, backup | **R2** | Murah, konsisten, tanpa biaya egress |
| Jadwal otomatis | Cron Trigger (pengingat, backup, arsip) | |
| CI/CD | GitHub Actions + `wrangler deploy` (secret Cloudflare di repo) | |

> Spesifikasi awal menyebut Next.js/NestJS/PostgreSQL. Fase 1 sengaja memakai stack **Worker-native** agar
> berjalan di link Worker, super cepat, dan hemat biaya. API dibuat REST bersih (`/api/...`) sehingga di Fase 3
> frontend Next.js dan/atau PostgreSQL (via Hyperdrive) bisa ditambahkan **tanpa membuang** apa pun.

### 3.2 Struktur Folder
```
BLUEPRINT.md            ← dokumen ini
wrangler.toml           ← binding D1/KV/R2, cron, assets
migrations/             ← skema D1 (idempotent)
src/
  index.js              ← entry: routing, keamanan, cron
  lib/                  ← auth, db, cms, storage, pdf, notify, audit, i18n, markdown, satusehat, payments
  schema/entities.js    ← REGISTRY semua entitas (dipakai API & UI untuk CRUD otomatis)
  api/                  ← public, auth, crud, clinical, pharmacy, billing, reports, portal, system
  site/                 ← renderer website publik (layout + halaman + blok)
  seed/                 ← konten default website
public/
  app/                  ← PWA (admin, dokter, pasien, kasir, apotek, lab, antrian)
  assets/               ← css, js, img, data (ICD-10)
  manifest.webmanifest, sw.js
```

### 3.3 Mesin CRUD berbasis skema
Semua entitas didefinisikan sekali di `src/schema/entities.js` (field, tipe, label ID/EN, relasi, kolom daftar,
pencarian, cakupan cabang, izin). Dari satu definisi itu otomatis tersedia:
- API: `GET/POST /api/crud/:entity`, `GET/PUT/DELETE /api/crud/:entity/:id`, ekspor.
- UI Admin: tabel dengan cari/filter/urut/paginasi, form tambah/ubah, hapus, ekspor Excel/CSV/PDF.
- Izin RBAC: `entity:view|create|update|delete|export`.

Menambah modul baru = menambah satu definisi entitas. Ini yang membuat **semuanya bisa di-CRUD di Admin**.

---

## 4. Strategi Data: Hemat D1, Maksimalkan KV & R2

| Data | Penyimpanan | Pola |
|---|---|---|
| Konten website (layanan, dokter, cabang, jadwal, fasilitas, harga, promo, testimoni, blog, FAQ, banner, halaman, pengaturan, menu) | **R2** `cms/<koleksi>.json` (sumber kebenaran, tulis bersyarat ETag) + **KV** `cms:bundle` (ringkas) & `cms:item:*` (isi panjang) | Halaman publik = **0 query D1**, 1 baca KV (+ cache memori isolate) |
| Master data klinik (poli, ruangan, tindakan+tarif, pemeriksaan lab+nilai rujukan, penjamin, kategori & satuan obat, peran & izin, tier member, hari libur) | R2 + KV (sama seperti konten) | Dibaca sangat sering, jarang berubah |
| Sesi login | **KV** `sess:*` (TTL 12 jam) | Tiap request API tidak menyentuh D1 untuk autentikasi |
| Rate limit login & form publik | KV + memori | |
| Snapshot antrian (layar TV & status pasien) | **KV** `queue:<cabang>:<tanggal>` | Layar antrian polling KV, bukan D1 |
| Statistik dashboard | KV `stats:*` (TTL 60 dtk) | Agregat D1 dihitung sekali per menit |
| Notifikasi pasien (in-app) | KV `notif:<user>` (50 terakhir) | |
| Token integrasi (SATU SEHAT, dll.) | KV (TTL sesuai token) | |
| File: foto, logo, dokumen medis, bukti transfer, lampiran ERM | **R2** `media/`, `docs/`, `proofs/` | Disajikan via `/media/*` dengan kontrol akses |
| PDF (invoice, kwitansi, hasil lab, resep, kartu pasien, bukti daftar) | Dibuat sekali → disimpan di **R2** `pdf/` → unduhan berikutnya langsung dari R2 | Regenerasi otomatis bila data berubah |
| Backup D1 (inkremental harian) & arsip audit log lama | **R2** `backups/`, `archive/` | D1 tetap ramping |
| Transaksi (pengguna, pasien, janji temu, kunjungan, ERM, resep, lab, invoice, pembayaran, stok, klaim, audit) | **D1** | Indeks tepat, `LIMIT`, tanpa `COUNT(*)` penuh, kolom JSON untuk item (1 baris per dokumen), nomor otomatis via tabel `counters` atomik |

Aturan D1:
1. Tidak ada `SELECT *` tanpa `LIMIT`; paginasi pakai "ambil N+1" (tanpa COUNT).
2. Semua filter memakai kolom berindeks (`branch_id`, `date`, `patient_id`, `status`, `doctor_id`).
3. Item dokumen (item invoice, item resep, hasil lab, diagnosis) disimpan sebagai JSON → 1 tulis, bukan N.
4. Batch (`db.batch`) untuk operasi multi-langkah (atomik).
5. Data lama (audit > 90 hari) diarsip ke R2 oleh cron.

---

## 5. Peran & Hak Akses (RBAC)

| Peran | Kode | Fokus layar |
|---|---|---|
| Super Admin | `superadmin` | Semua fitur, sistem, backup/restore, peran |
| Admin | `admin` | Operasional & konten semua cabang |
| Manajemen | `manager` | Dashboard, laporan, analitik (baca) |
| Dokter | `doctor` | Jadwal, antrian, pemeriksaan SOAP/ERM, resep, permintaan lab, riwayat pasien |
| Perawat | `nurse` | Triase & tanda vital, tindakan perawat, antrian |
| Apoteker | `pharmacist` | Resep masuk, dispensing (FEFO), penjualan obat, stok, PO, supplier |
| Kasir | `cashier` | Billing, pembayaran multi-metode, kwitansi, refund |
| Pendaftaran | `registration` | Registrasi pasien, kunjungan, antrian, cetak kartu |
| Laboratorium | `lab` | Permintaan & hasil lab, validasi, cetak hasil |
| Marketing | `marketing` | Konten website, blog, promo, kupon, lead, newsletter |
| Pasien | `patient` | Portal pasien |

Izin dapat diubah per peran dari **Admin → Peran & Izin** (matriks centang). Pengguna dapat dibatasi ke satu cabang
atau pusat (semua cabang).

### Akun awal
Akun awal dibuat langsung di database produksi (tidak disimpan di repo). Username:
`superadmin`, `admin`, `manajemen`, `dokter`, `perawat`, `apoteker`, `kasir`, `pendaftaran`, `lab`, `marketing`, `pasien`.
Password diserahkan langsung ke pemilik. **Segera ganti password & aktifkan 2FA** setelah login pertama.
Instalasi baru tanpa pengguna otomatis membuka halaman **Setup Awal** untuk membuat Super Admin.

---

## 6. Modul & Status

Legenda: ✅ Dibangun di Fase 1 · 🔌 Kode siap, aktif setelah kredensial diisi · 🗓️ Fase berikutnya

### 6.1 Website Publik
| Fitur | Status |
|---|---|
| Beranda, Tentang, Layanan (+detail), Dokter (+profil), Jadwal Dokter, Fasilitas, Cabang (+detail & Google Maps), Booking, Harga, Promo, Testimoni, Blog (+artikel), FAQ, Kontak, Kebijakan Privasi, Syarat & Ketentuan | ✅ |
| Halaman dinamis/landing page dari blok (hero, teks, gambar, CTA, layanan, dokter, promo, testimoni, FAQ, statistik, cabang, artikel, galeri) | ✅ |
| Menu navigasi & footer diatur dari Admin | ✅ |
| ID/EN (`/en/...`), dark/light, responsif, animasi halus | ✅ |
| SEO: meta, OpenGraph, canonical, hreflang, JSON-LD (MedicalClinic, Physician, FAQPage, Article), `sitemap.xml`, `robots.txt` | ✅ |
| Google Analytics / tag konversi (isi ID di Pengaturan) | ✅ |
| Stempel "Website ini dijual" di beranda (dapat diatur) | ✅ |
| Newsletter, form kontak → Lead | ✅ |

### 6.2 Booking Online
| Fitur | Status |
|---|---|
| Wizard: cabang → layanan/poli → dokter → tanggal → jam (slot real-time) → data pasien → konfirmasi | ✅ |
| Nomor booking otomatis, kupon promo, kode referral | ✅ |
| Cek status, reschedule, batal (nomor booking + no. HP) | ✅ |
| Waiting list bila slot penuh | ✅ |
| Konsultasi online (telemedicine) → link video Jitsi otomatis | ✅ |
| Pengingat H-1 (cron) via WhatsApp/Email/notifikasi portal | ✅ / 🔌 WA gateway |
| QR check-in & online check-in | ✅ |

### 6.3 Portal Pasien
Registrasi & login, profil, janji temu, riwayat kunjungan, rekam medis ringkas (diagnosis, resep, hasil lab),
dokumen medis, invoice & riwayat pembayaran, **unduh PDF** (invoice, kwitansi, hasil lab, resep, kartu pasien),
upload bukti transfer, bayar online 🔌, notifikasi, QR check-in, gabung telemedicine. — ✅

### 6.4 Dashboard Dokter
Profil & jadwal, janji & antrian hari ini, panggil pasien, pemeriksaan **SOAP** (anamnesis, pemeriksaan fisik,
tanda vital, diagnosis ICD-10, tindakan, terapi, resep, permintaan lab, catatan), riwayat pasien lengkap,
upload dokumen medis, hasil lab. — ✅

### 6.5 SIM Klinik (dari dokumen `Klinik_1.txt`)
| No | Modul | Isi | Status |
|---|---|---|---|
| 1 | Pendaftaran & Registrasi | Pasien baru/lama, **No. RM otomatis**, identitas, keluarga/penanggung jawab, pencarian, update, riwayat kunjungan, **cetak kartu pasien (PDF)** | ✅ |
| 2 | Database Pasien | Biodata, No. RM, riwayat kunjungan/pemeriksaan/diagnosis/tindakan/resep/obat/lab/pembayaran, dokumen | ✅ |
| 3 | Antrian & Kunjungan | Nomor antrian otomatis per poli & dokter, status, **panggil pasien + suara**, **layar antrian TV** (`/antrian`), cetak bukti pendaftaran | ✅ |
| 4 | Poli / Unit | Umum, Gigi, KIA, Anak, Kulit & Kecantikan, dll; layanan, dokter & jadwal per poli | ✅ |
| 5 | Dokter | Database, profil, jadwal, poli, appointment, daftar & riwayat pasien, pemeriksaan | ✅ |
| 6 | Rekam Medis Elektronik | SOAP, anamnesis, pemeriksaan fisik, vital signs, diagnosis, tindakan, terapi, resep, catatan, lampiran, riwayat | ✅ |
| 7 | Tindakan Medis | Master & tarif tindakan, tindakan dokter/perawat, riwayat, masuk billing otomatis | ✅ |
| 8 | Farmasi / Apotek | Master obat, kategori, satuan, harga, resep dokter, **dispensing FEFO**, penjualan bebas, retur, riwayat obat pasien, batch & kedaluwarsa, stok minimum | ✅ |
| 9 | Inventory | Stok masuk/keluar, **stock opname**, PO, supplier, penerimaan barang, mutasi antar cabang, adjustment, alert minimum & kedaluwarsa, laporan | ✅ |
| 10 | Jadwal | Jadwal dokter & poli, jam & hari praktik, slot & kuota, hari libur | ✅ |
| 11 | Laboratorium | Master pemeriksaan + nilai rujukan, permintaan, input & validasi hasil (flag H/L otomatis), riwayat, **cetak hasil (PDF)** | ✅ |
| 12 | Billing & Pembayaran | Konsultasi + tindakan + obat + lab otomatis, diskon/kupon, **invoice & kwitansi PDF**, multi-metode, status, riwayat, refund | ✅ |
| 13 | BPJS / Asuransi | Data penjamin, no. peserta, klaim & status klaim, administrasi | ✅ · 🔌 bridging BPJS (VClaim/PCare) |
| 14 | SATU SEHAT | Pemetaan FHIR: Patient, Practitioner, Encounter, Observation, Condition, Medication, MedicationRequest, DiagnosticReport; antrean sinkron & monitoring | ✅ pemetaan · 🔌 kirim (butuh Client ID/Secret/Org ID) |
| 15 | Laporan | Pasien, kunjungan, dokter, poli, diagnosis, tindakan, obat, stok, penjualan, pembayaran, pendapatan, lab, inventory — **ekspor Excel (.xlsx), CSV, PDF** | ✅ |
| 16 | Dashboard Manajemen | Total pasien, pasien & kunjungan hari ini, appointment, antrian, pendapatan, penggunaan obat, stok, obat hampir kedaluwarsa, grafik | ✅ |
| 17 | User & Role | 11 peran bawaan + peran kustom, matriks izin, audit log | ✅ |
| 18 | Keamanan | Lihat §8 | ✅ |
| 19 | Multi-cabang | Pasien, dokter, poli, jadwal, apotek, inventory, billing, laporan per cabang + manajemen pusat | ✅ |
| 20 | Fitur tambahan | Registrasi & appointment online, portal pasien, notifikasi WA/Email, QR code, antrian digital, responsif, API, ekspor/impor, backup otomatis | ✅ / 🔌 |

### 6.6 Admin / Manajemen (semua CRUD)
Dashboard · Pasien · Dokter · Staf · Appointment · Jadwal · Poli · Layanan · Harga · Promo · Kupon · Cabang · Ruangan ·
Tindakan · Pemeriksaan Lab · Obat · Stok · Supplier · PO · Invoice · Pembayaran · Refund · Klaim · Penjamin ·
Korporat · Member & Poin · Blog · FAQ · Banner · Halaman · Testimoni · Fasilitas · Lead · Newsletter · Media (R2) ·
Pengguna · Peran & Izin · Pengaturan (identitas, logo, kontak, pembayaran, integrasi, SEO, stempel) ·
Laporan · Audit Log · Backup & Restore · SATU SEHAT · Blueprint.

### 6.7 Pembayaran
| Metode | Status |
|---|---|
| Tunai, transfer bank (upload bukti → konfirmasi kasir), QRIS statis (gambar QRIS dari Pengaturan) | ✅ |
| Virtual Account, e-wallet, kartu kredit/debit via **Midtrans Snap** (webhook tervalidasi signature) | 🔌 `MIDTRANS_SERVER_KEY` |
| Invoice otomatis, status, konfirmasi, refund | ✅ |

### 6.8 Notifikasi
| Kanal | Status |
|---|---|
| Notifikasi in-app portal pasien & staf | ✅ |
| WhatsApp: tombol kirim 1-klik (wa.me) untuk staf | ✅ |
| WhatsApp otomatis via gateway (Fonnte/Wablas/WA Cloud API) | 🔌 token gateway |
| Email (Resend) | 🔌 `RESEND_API_KEY` |
| SMS | 🔌 gateway SMS |
| Push notification (Web Push/VAPID) | 🗓️ Fase 2 |

### 6.9 Fitur lanjutan
| Fitur | Status |
|---|---|
| Telemedicine video (Jitsi) | ✅ |
| Antrian digital, online check-in, QR check-in | ✅ |
| E-prescription, lab, farmasi, inventory | ✅ |
| CRM (lead, newsletter, referral), membership & poin loyalitas, pasien korporat | ✅ |
| Integrasi asuransi/BPJS bridging, akuntansi (ekspor jurnal) | 🔌 / 🗓️ |
| API untuk aplikasi mobile (REST + token sesi) | ✅ |
| Multi-tenant (banyak klinik berbeda di satu platform) | 🗓️ Fase 3 (arsitektur sudah memisahkan cabang) |

---

## 7. Alur Kerja Utama

```
Booking online / datang langsung
   → Pendaftaran (pasien baru: No. RM otomatis) → Kunjungan + Nomor Antrian (per poli)
   → Perawat: triase & tanda vital
   → Dokter: panggil (suara + layar TV) → SOAP/ERM → diagnosis → tindakan → resep → permintaan lab
   → Lab: input & validasi hasil (PDF)          → Apotek: dispensing FEFO (stok otomatis berkurang)
   → Kasir: invoice otomatis (konsultasi + tindakan + obat + lab) → pembayaran → kwitansi PDF
   → Portal pasien: riwayat, dokumen, invoice, hasil lab dapat diunduh
   → SATU SEHAT: antrean sinkron FHIR · Laporan & Dashboard terupdate
```

## 8. Keamanan

| Kontrol | Implementasi |
|---|---|
| HTTPS/SSL, WAF, DDoS | Cloudflare (otomatis) |
| Password hashing | PBKDF2-SHA256 100.000 iterasi + salt acak per pengguna |
| Sesi | Token acak 256-bit di KV, cookie `HttpOnly; Secure; SameSite=Lax`, kedaluwarsa 12 jam, logout semua sesi |
| 2FA | TOTP (Google Authenticator/Authy), QR setup |
| RBAC | Izin per entitas & aksi, pembatasan per cabang |
| CSRF | SameSite + header wajib `X-GK` + cek `Origin` pada semua request yang mengubah data |
| SQL Injection | 100% prepared statement; nama kolom hanya dari registry skema |
| XSS | Escape semua output, CSP ketat, Markdown aman |
| Rate limiting | Login & form publik (KV + memori) |
| Audit log | Semua create/update/delete/login/unduh dokumen sensitif |
| Akses file | Dokumen medis di R2 hanya dapat diakses pemilik & peran berwenang |
| Backup & DR | Backup inkremental harian D1 → R2, D1 Time Travel 30 hari, ekspor manual, restore Super Admin |
| Monitoring | Workers Observability/logs, halaman status sistem |

## 9. Dokumen yang Bisa Diunduh
Invoice (PDF) · Kwitansi (PDF) · Hasil laboratorium (PDF) · Resep/e-prescription (PDF) · Kartu pasien (PDF, dengan
No. RM) · Bukti pendaftaran/booking (PDF + QR) · Ringkasan rekam medis (PDF) · Laporan (XLSX/CSV/PDF) ·
Ekspor data tiap tabel (XLSX/CSV) · Backup (NDJSON).

## 10. Install sebagai Aplikasi (PWA)
- **Android (Chrome)**: buka situs → menu ⋮ → *Install app / Tambahkan ke layar utama* (atau tombol **Install** di situs).
- **iPhone/iPad (Safari)**: tombol Bagikan → *Add to Home Screen*.
- **Windows/Mac/Linux (Chrome/Edge)**: ikon install di address bar → *Install Global Klinik*.
Aplikasi terbuka layar penuh, punya ikon sendiri, shortcut (Booking, Portal, Antrian), dan tetap membuka shell saat offline.

## 11. Deploy & Operasional
1. Push ke branch → GitHub Actions menjalankan `wrangler d1 migrations apply` lalu `wrangler deploy`.
2. Secret repo yang dibaca workflow: `CLOUDFLARE_API_TOKEN` (atau `CF_API_TOKEN`) dan `CLOUDFLARE_ACCOUNT_ID` (atau `CF_ACCOUNT_ID`).
   Token butuh izin: *Workers Scripts:Edit, D1:Edit, Workers KV:Edit, Workers R2:Edit, Account Settings:Read*.
3. Resource Cloudflare: D1 `global-klinik-db`, KV `global-klinik-kv` & `global-klinik-sessions`, R2 `global-klinik-storage`.
4. Cron: tiap jam (pengingat & antrean sinkron), harian 00:30 WIB (backup inkremental & arsip).
5. Domain sendiri: tambahkan *Custom Domain* pada Worker di dashboard Cloudflare — tanpa perubahan kode.

## 12. Yang Dibutuhkan dari Pemilik (opsional, untuk mengaktifkan 🔌)
| Kebutuhan | Untuk |
|---|---|
| Nama klinik final, alamat, no. telepon/WA, email, jam operasional | Mengganti data contoh |
| Foto klinik, dokter, fasilitas | Upload di Admin → Media (tersimpan di R2) |
| Token gateway WhatsApp (Fonnte/Wablas/WA Cloud API) | Notifikasi WA otomatis |
| `RESEND_API_KEY` + domain email | Email otomatis |
| `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` | VA, e-wallet, kartu |
| SATU SEHAT: Client ID, Client Secret, Organization ID | Kirim data FHIR |
| Kredensial BPJS (cons-id, secret, user key) | Bridging VClaim/PCare |
| Google Analytics ID | Analitik & konversi |
| Domain sendiri | Menggantikan link workers.dev |

## 13. Roadmap
| Fase | Isi |
|---|---|
| **1 (sekarang)** | Semua modul ✅ di atas, deploy di link Worker, PWA |
| 2 | Aktivasi integrasi 🔌, Web Push, bridging BPJS, ekspor jurnal akuntansi, tanda tangan digital dokumen |
| 3 | Multi-tenant (SaaS banyak klinik), frontend Next.js opsional, aplikasi native (Capacitor) dari PWA yang sama, PostgreSQL via Hyperdrive bila skala sangat besar |

## 14. Log Perubahan
| Tanggal | Perubahan |
|---|---|
| 2026-09-27 | Blueprint v1 disusun; resource Cloudflare dibuat; implementasi Fase 1 dimulai |
