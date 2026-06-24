# PRIMA — Sistem Perencanaan & Kinerja RSJD Dr. Amino Gondohutomo

Aplikasi web internal RSJD Dr. Amino Gondohutomo Semarang untuk manajemen perencanaan, penganggaran, dan kinerja: **Usulan Kebutuhan Aset**, **E-Anggaran (eControlling)**, **BLUD**, **Perjanjian Kinerja**, **LKjIP**, **Buku Besar Aset**, dan **Rencana Aksi**. Dibangun dengan Next.js 16 (App Router) dan MySQL 8.

> ⚠️ Repositori ini berisi kode aplikasi saja. Konfigurasi rahasia (kredensial DB, JWT secret, token API) **tidak** disertakan — lihat `.env.example` untuk daftar variabel yang harus diisi sendiri.

---

## Stack Teknologi

| Layer | Teknologi |
|-------|-----------|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Database | MySQL 8 via `mysql2` (raw SQL, tagged template) |
| Auth | JWT (`jose`) · bcryptjs · HTTP-only cookie |
| Keamanan | Redis/Upstash (rate limiting) · Cloudflare Turnstile · Audit Log · CSP nonce |
| Storage | Google Drive API (arsip dokumen & file pendukung) |
| Email | Nodemailer / Gmail SMTP |
| UI | Tailwind CSS · shadcn/ui · Lucide Icons |
| Deployment | Server (Linux/Windows) + PM2 + Nginx + MySQL EVENT (cron) |

---

## Fitur Utama

- **Usulan Kebutuhan** — pengajuan, review bidang, telaah admin, putusan Kasubag/Kabag, export
- **E-Anggaran (eControlling)** — input SSK, rekening, realisasi, pendapatan, laporan, versi MURNI/PERUBAHAN
- **BLUD** — DPA, pergeseran, kode besar, master akun, penanggung jawab, cetak rekap
- **Perjanjian Kinerja (PK)** — penyusun dokumen + generator Word
- **LKjIP** — penyusun Laporan Kinerja tahunan berbasis outline-tree + generator Word
- **Buku Besar Aset** — register belanja modal lintas-tahun + lifecycle realisasi
- **Rencana Aksi** — turunan target kinerja
- **Manajemen User** — RBAC bertingkat, aktivasi, reset password, app access control, role promotion
- **Audit Trail & Notifikasi** — semua aksi kritis tercatat; notifikasi real-time per user/role

---

## Struktur Folder

```
app/
├── (auth)/          # Login, reset password, verify email
├── (dashboard)/     # Modul: usulan, kinerja, blud, perjanjian-kinerja, lkjip, dll
└── api/             # API routes per modul

lib/
├── data/            # db.ts (MySQL pool), data layer per modul
├── security/        # auth.ts, auditlog.ts, ratelimit.ts
└── services/        # email.ts, notifications.ts, drive.ts

docs/
├── schema-mysql.sql # Skema database
├── migrations/      # Skrip migrasi (MySQL)
└── design/          # Design system

proxy.ts             # Edge Runtime — route guard & CSP (BUKAN middleware.ts)
types/index.ts       # Definisi TypeScript types
lib/constants.ts     # Roles, status, mapping bidang
```

---

## Instalasi & Menjalankan Lokal

### 1. Clone & install dependencies

```bash
git clone https://github.com/aminomonev-ux/prima-web-2.git
cd prima-web-2
npm install
```

### 2. Konfigurasi environment

Salin `.env.example` menjadi `.env.local`, lalu isi nilai sebenarnya:

```bash
cp .env.example .env.local
```

Variabel wajib: `MYSQL_*`, `JWT_SECRET` (min 32 char), `CRON_SECRET`. Selengkapnya ada di `.env.example` beserta cara generate masing-masing.

### 3. Setup database

```bash
mysql -u root -p prima_db < docs/schema-mysql.sql
```

Lalu jalankan migrasi di `docs/migrations/` sesuai urutan jika diperlukan.

### 4. Jalankan development server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

---

## Sistem Role

```
SUPER_ADMIN
ADMIN · ADMIN_KASUBAG · ADMIN_KABAG
BIDANG_* (4 bidang)
SUB_BIDANG (18 role)
```

Detail mapping role → bidang ada di `lib/constants.ts`.

---

## Keamanan

- Session JWT di HTTP-only cookie (`prima_session`)
- Rate limiting (login max 5x → lock 15 menit; session timeout 60 menit)
- CSP nonce per-request dikelola di `proxy.ts`
- HTTP security headers di `next.config.ts` (HSTS, X-Frame-Options, nosniff, dll)
- `JWT_SECRET` wajib diisi — aplikasi gagal start jika kosong
- Semua aksi kritis dicatat di tabel `audit_log`
- CI keamanan otomatis: SAST (Semgrep), npm-audit, secret-scan (Gitleaks), tsc + ESLint
- **Jangan rename `proxy.ts` ke `middleware.ts`** — konflik fatal di Next.js

Menemukan kerentanan? Lihat [`SECURITY.md`](SECURITY.md).

---

## Lisensi

Lihat [`LICENSE`](LICENSE).
