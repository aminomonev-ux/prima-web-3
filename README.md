# PRIMA — Sistem Perencanaan & Kinerja RSJD Dr. Amino Gondohutomo · **Edisi Intranet**

Aplikasi web internal RSJD Dr. Amino Gondohutomo Semarang untuk manajemen perencanaan, penganggaran, dan kinerja: **Usulan Kebutuhan Aset**, **E-Anggaran (eControlling)**, **BLUD**, **Perjanjian Kinerja**, **LKjIP**, **Buku Besar Aset**, dan **Rencana Aksi**. Dibangun dengan Next.js 16 (App Router) dan MySQL 8.

> ⚠️ Repositori ini berisi kode aplikasi saja. Konfigurasi rahasia (kredensial DB, JWT secret, token API) **tidak** disertakan — lihat `.env.example` untuk daftar variabel yang harus diisi sendiri.

> 🏢 **Edisi Intranet (LAN-only).** Versi ini dirancang untuk deployment di jaringan lokal kantor tanpa IP publik. Dependensi eksternal yang tidak relevan **dimatikan**: **email (Gmail SMTP)**, **CAPTCHA (Cloudflare Turnstile)**, dan **Upstash Redis cloud**. Konsekuensinya: **registrasi publik nonaktif** — akun dibuat oleh Super Admin lewat Admin Panel, dan reset password juga admin-driven. Detail perbedaan vs edisi penuh ada di [`docs/INTRANET-DELTA.md`](docs/INTRANET-DELTA.md).

---

## Stack Teknologi

| Layer | Teknologi |
|-------|-----------|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Database | MySQL 8 via `mysql2` (raw SQL, tagged template) |
| Auth | JWT (`jose`) · bcryptjs · HTTP-only cookie |
| Keamanan | Redis lokal (rate limiting) · login lockout · Audit Log · CSP nonce |
| Storage | Google Drive API — opsional (butuh internet outbound dari server) |
| Email | — (dinonaktifkan di edisi intranet) |
| CAPTCHA | — (dinonaktifkan di edisi intranet) |
| UI | Tailwind CSS · shadcn/ui · Lucide Icons |
| Deployment | Server LAN (Linux/Windows) + PM2 + Nginx + MySQL EVENT (cron) |

---

## Fitur Utama

- **Usulan Kebutuhan** — pengajuan, review bidang, telaah admin, putusan Kasubag/Kabag, export
- **E-Anggaran (eControlling)** — input SSK, rekening, realisasi, pendapatan, laporan, versi MURNI/PERUBAHAN
- **BLUD** — DPA, pergeseran, kode besar, master akun, penanggung jawab, cetak rekap
- **Perjanjian Kinerja (PK)** — penyusun dokumen + generator Word
- **LKjIP** — penyusun Laporan Kinerja tahunan berbasis outline-tree + generator Word
- **Buku Besar Aset** — register belanja modal lintas-tahun + lifecycle realisasi
- **Rencana Aksi** — turunan target kinerja
- **Manajemen User** — RBAC bertingkat; **pembuatan akun & reset password oleh Super Admin** (registrasi publik nonaktif); app access control; role promotion
- **Audit Trail & Notifikasi** — semua aksi kritis tercatat; notifikasi real-time per user/role

---

## Struktur Folder

```
app/
├── (auth)/          # Login (edisi intranet: reset-password & verify-email redirect ke /login)
├── (dashboard)/     # Modul: usulan, kinerja, blud, perjanjian-kinerja, lkjip, dll
└── api/             # API routes per modul

lib/
├── data/            # db.ts (MySQL pool), data layer per modul
├── security/        # auth.ts, auditlog.ts, ratelimit.ts, recaptcha.ts (no-op di intranet)
└── services/        # email.ts (no-op di intranet), notifications.ts, drive.ts

docs/
├── schema-mysql.sql # Skema database
├── migrations/      # Skrip migrasi (MySQL)
├── design/          # Design system
└── INTRANET-DELTA.md# Daftar perbedaan edisi intranet vs edisi penuh

proxy.ts             # Edge Runtime — route guard & CSP (BUKAN middleware.ts)
types/index.ts       # Definisi TypeScript types
lib/constants.ts     # Roles, status, mapping bidang
```

---

## Instalasi & Menjalankan Lokal

### 1. Clone & install dependencies

```bash
git clone https://github.com/aminomonev-ux/prima-web-3.git
cd prima-web-3
npm install
```

### 2. Konfigurasi environment

Salin `.env.example` menjadi `.env.local`, lalu isi nilai sebenarnya:

```bash
cp .env.example .env.local
```

Variabel wajib: `MYSQL_*`, `JWT_SECRET` (min 32 char), `CRON_SECRET`, `PROMOTION_*`. Rekomendasi: `REDIS_URL` (Redis lokal). Variabel email/Turnstile/Upstash **tidak dipakai** di edisi ini. Selengkapnya ada di `.env.example`.

### 3. Setup database

```bash
mysql -u root -p prima_db < docs/schema-mysql.sql
```

Lalu jalankan migrasi di `docs/migrations/` sesuai urutan jika diperlukan.

### 4. Jalankan development server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Untuk deployment LAN, set `NEXT_PUBLIC_APP_URL` ke hostname internal (mis. `http://prima.kantor.local`), bukan IP mentah.

---

## Sistem Role

```
SUPER_ADMIN
ADMIN · ADMIN_KASUBAG · ADMIN_KABAG
BIDANG_* (4 bidang)
SUB_BIDANG (18 role)
```

Detail mapping role → bidang ada di `lib/constants.ts`. **Pembuatan akun**: Admin Panel → User Management → **Tambah User** (khusus Super Admin).

---

## Keamanan

- Session JWT di HTTP-only cookie (`prima_session`)
- **Login lockout** (max 5x salah → kunci 15 menit, atomik) · session timeout 60 menit
- Rate limiting via Redis lokal (`REDIS_URL`); kalau Redis tidak dipasang/`REDIS_URL` kosong → fallback throttle **in-memory per-proses** (V5-AUTH-04), bukan fail-open total — login throttle/lockout tetap aktif
- CSP nonce per-request dikelola di `proxy.ts`
- HTTP security headers di `next.config.ts` (HSTS, X-Frame-Options, nosniff, dll)
- `JWT_SECRET` wajib diisi — aplikasi gagal start jika kosong
- Semua aksi kritis dicatat di tabel `audit_log`
- CI keamanan otomatis: SAST (Semgrep), npm-audit, secret-scan (Gitleaks), tsc + ESLint
- **Jangan rename `proxy.ts` ke `middleware.ts`** — konflik fatal di Next.js

> Catatan edisi intranet: CAPTCHA (Turnstile) dimatikan karena LAN tepercaya tanpa IP publik — lapisan login lain (lockout, rate-limit, anti-enumeration) tetap aktif. Lihat [`docs/INTRANET-DELTA.md`](docs/INTRANET-DELTA.md).

Menemukan kerentanan? Lihat [`SECURITY.md`](SECURITY.md).

---

## Pengembangan & Sinkronisasi Repo

Repo ini adalah **mirror publik tersensor**. Alur kerja menjaga agar dokumen internal & rahasia tidak pernah bocor ke publik:

- **Update kode** → edit di folder repo ini, lalu commit & push biasa (branch default: `main`):
  ```bash
  git add -A
  git commit -m "pesan perubahan"
  git push origin main
  ```
- Repo ini **tidak menyimpan remote ke repo privat** — tidak ada jalur otomatis maupun manual yang gampang membocorkan dokumen internal. Hanya ada satu remote: `origin` (repo publik ini).
- Perbaikan dari repo privat dibawa ke sini **secara selektif (cherry-pick file kode saja)**, bukan merge/pull penuh — supaya dokumen audit/keamanan/deployment tidak pernah ikut.

---

## Lisensi

Lihat [`LICENSE`](LICENSE).
