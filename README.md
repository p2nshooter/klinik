# Global Klinik — Digital Clinic Platform & SIM Klinik

Website klinik premium + aplikasi PWA (admin, dokter, perawat, apotek, kasir, lab, portal pasien) di atas
**Cloudflare Workers** dengan **D1** (transaksi), **KV** (cache, sesi, antrian) dan **R2** (konten CMS, file, PDF, backup).

> 📘 Dokumen induk: **[BLUEPRINT.md](BLUEPRINT.md)** — arsitektur, modul, peran, status, roadmap. Juga tampil di aplikasi: menu *Blueprint & Panduan*.

## Fitur utama
- Website publik SSR (SEO, ID/EN, dark/light, stempel "Website ini dijual"), booking online real-time, cek/ubah/batal booking, layar antrian TV dengan suara.
- SIM Klinik lengkap: registrasi & No. RM otomatis, antrian per poli, triase, ERM/SOAP + ICD-10, tindakan, e-resep, laboratorium, farmasi FEFO, inventory (PO, opname, mutasi), billing multi-metode, refund, klaim BPJS/asuransi, laporan (Excel/CSV/PDF), dashboard.
- Semua modul dapat di-CRUD dari Admin (registry `src/schema/entities.js`), termasuk halaman website berbasis blok, menu, peran & izin.
- Dokumen PDF: invoice, kwitansi, hasil lab, resep, kartu pasien, bukti daftar, bukti booking, resume medis, laporan.
- Email lewat modul SMTP bawaan (Gmail/Zoho/email hosting) — server, user & password diatur dari Admin → Pengaturan → Integrasi.
- Keamanan: PBKDF2, sesi HttpOnly (KV), 2FA TOTP, RBAC per cabang, CSRF, CSP, rate limit, audit log, backup R2.
- PWA: install di Android, iPhone, Windows, macOS, Linux.

## Struktur
```
src/            Worker (API, SSR website, PDF, cron)
public/         Aset statis + aplikasi PWA (public/app)
migrations/     Skema D1 (dibuat dari registry: node scripts/gen-schema.mjs)
scripts/        check, gen-schema, seed-demo, seed-users
```

## Pengembangan lokal
```bash
npm install
npm run migrate:local
node scripts/seed-demo.mjs && npx wrangler d1 execute global-klinik-db --local --file seed/demo.sql
node scripts/seed-users.mjs .   # buat akun + password acak (users.sql & credentials.txt — jangan di-commit)
npx wrangler d1 execute global-klinik-db --local --file users.sql
npm run dev                      # http://localhost:8787  ·  aplikasi: /app/
```

## Deploy
Push ke branch → GitHub Actions (`.github/workflows/deploy.yml`): cek kode → migrasi D1 → seed demo (hanya jika DB kosong) → `wrangler deploy` → smoke test.
Secret repo: `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`.

Secret Worker opsional — isi sebagai secret repo GitHub (otomatis disalin ke Worker saat deploy) atau langsung di Cloudflare → Workers → global-klinik → Settings → Variables:
`WA_TOKEN` (+`WA_API_URL`/`WA_PHONE_ID`), `SMTP_PASS` (+`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_FROM`), `MIDTRANS_SERVER_KEY` (+`MIDTRANS_IS_PRODUCTION`), `SATUSEHAT_CLIENT_ID`, `SATUSEHAT_CLIENT_SECRET`, `SMS_API_URL`, `SMS_API_KEY`.
