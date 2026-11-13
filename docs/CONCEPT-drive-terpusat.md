# Konsep — Drive Terpusat PRIMA (satu pintu kredensial & tujuan)

> Status: **KONSEP SAJA, belum ada kode, belum ada tabel.** Dokumen ini mencatat hasil
> audit integrasi Google Drive yang ada sekarang, lalu mengusulkan satu bentuk akhir:
> satu pintu kredensial, satu peta tujuan, satu tombol uji, satu manifest, dan satu
> prosedur pindah akun. Skema di §5 masih usulan; kalau disetujui ia wajib masuk
> `docs/schema-mysql.sql` + `docs/migrations/migration-drive-terpusat.sql` pada saat
> dikerjakan (bukan sebelumnya).

## 0. Kedudukan dokumen ini

PRIMA sudah memakai Drive di lima jalur: lampiran usulan, arsip versi & impor LKJIP,
bukti/referensi BBA, cadangan JSON BLUD, dan dump database harian. Semuanya bekerja.
Yang belum ada bukan kemampuan, melainkan **keseragaman**: kredensial ditulis empat
kali, folder tujuan dibaca di enam tempat, tidak ada satu pun tombol untuk memastikan
"sambungan ke Drive masih hidup", dan tidak ada catatan hasil unggahan backup di
database.

Dokumen ini menjawab lima pertanyaan: apa yang salah sekarang (§2), bentuk akhirnya
seperti apa (§4–§9), bagaimana operator memakainya (§10), bagaimana pindah akun
Google tanpa menyentuh kode (§11), dan apa yang sengaja tidak dikerjakan (§12).

## 1. Ringkasan keputusan

| Hal | Sekarang | Usulan |
|---|---|---|
| Klien OAuth | 4 salinan kode (`lib/services/drive.ts`, `/api/upload`, `/api/upload/download`, `scripts/backup-db.js`) | 1 di `lib/services/drive.ts`; skrip Node tetap 1 (CommonJS) dan didokumentasikan sebagai pengecualian |
| Folder tujuan | 6 pembaca: resolver `folderUnggahan()`, `GOOGLE_DRIVE_FOLDER_ID_LKJIP` langsung, `_BLUD_JSON` langsung, `_BACKUP` di skrip | 1 resolver `folderUntuk(tujuan)`; `app_config` dulu, env sebagai cadangan |
| Ganti akun Google | sunting 3 berkas TS + 1 skrip + 4–5 env | ganti 3 env + isi 1 nilai di Admin Panel + klik **Uji** |
| Bukti backup | baris di `scripts/backup-db.log` (di disk server) | tabel `drive_arsip` + `drive_health`, tampil di Admin Panel |
| Tahu sambungan mati | saat upload gagal | tombol **Uji** (email akun, kuota, probe per tujuan) + "Terakhir berhasil" |
| Rotasi backup | berdasarkan nama berkas, `slice(retention)` | berdasarkan manifest + umur, hanya berkas yang tercatat |

Yang **tidak** berubah: enkripsi AES-256-GCM + gzip, fail-closed tanpa
`BACKUP_ENC_PASSWORD`, `backups-pending/`, `MYSQL_PWD`, berkas Drive privat + proxy
unduh ber-otorisasi, dan `uploaded_files` sebagai dasar otorisasi unduhan.

## 2. Hasil audit (13 November 2026)

### 2.1 Temuan

| # | Temuan | Bukti | Akibat |
|---|---|---|---|
| A1 | Klien OAuth ditulis empat kali | `lib/services/drive.ts:9`, `app/api/upload/route.ts:63`, `app/api/upload/download/route.ts:21`, `scripts/backup-db.js:118` | ganti akun = 4 suntingan; satu terlewat = jalur itu mati diam-diam (pola L69: perbaikan tidak kena semua jalur) |
| A2 | Folder tujuan dibaca di enam tempat | `lib/security/unggahan-modul.ts:36`, `app/api/lkjip/[id]/versi/route.ts:49`, `lib/blud/cadangan-json.ts:46`, `scripts/backup-db.js:156` | fallback "kosong → folder umum" hanya berlaku di `/api/upload`; LKJIP & backup tidak |
| A3 | `PANDUAN-pemasangan-windows.md` tidak menyebut `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` | panduan L145–156 hanya 4 variabel folder | server baru mengikuti panduan → panel cadangan JSON BLUD selamanya "belum dikonfigurasi" |
| A4 | Tidak ada indikator kesehatan backup DB di aplikasi | panel BLUD punya `{aktif, sudah, belum, terakhir}`; backup DB hanya menulis `scripts/backup-db.log` (gitignored) | cron mati berbulan-bulan tanpa ada yang tahu — gejala yang sama dengan masalah cadangan BLUD dulu |
| A5 | Hasil unggahan backup tidak tercatat di database | skrip hanya `log('UPLOAD-OK', …)` | tidak ada manifest; restore bergantung "cari-cari di Drive" |
| A6 | Rotasi berbasis nama berkas | `name contains 'prima-db-'` lalu hapus `slice(retention)` | salinan arsip manual dengan awalan sama bisa ikut terhapus; dua proses bersamaan bisa saling menghapus |
| A7 | `uploaded_files` tidak menyimpan nama/ukuran | schema: `file_id, uploaded_by, context, sniff_ok, created_at` | daftar berkas tidak bisa ditampilkan tanpa memanggil Drive per baris |
| A8 | UI usulan menampilkan tautan Drive bila `file_url` mengandung `drive.google.com` | `BuatPanel.tsx:419`, `DetailModal.tsx:231` | berkas baru menyimpan URL proxy (aman); baris lama bisa memuat tautan Drive yang menuntut izin akses. Diperiksa 13 Nov 2026 pada `prima_db_3`: **0** baris memuat tautan Drive (§16.1), jadi tidak ada data yang perlu dibersihkan — sisanya soal label |
| A9 | Kuota akun tidak pernah dibaca | `about.get` tidak dipakai di mana pun | kuota penuh baru ketahuan saat unggahan gagal |
| A10 | Konfigurasi Drive tidak bisa diaudit | semuanya env | tidak ada jejak siapa mengganti folder & kapan |
| A11 | Backup hanya MySQL | `mysqldump --databases` | lampiran usulan, bukti BBA, dan docx LKJIP tidak punya salinan kedua |
| A12 | Token ber-scope `drive.file` tidak bisa membaca folder milik pemilik | `CONCEPT-bba-perencanaan.md:201` (`files.get` → 404) | "cari folder berdasarkan nama, kalau tidak ada buat" tidak andal untuk folder induk buatan orang |
| A13 | `scripts/backup-db.js` memuat `.env.local` sendiri | L38–L52 (`loadEnv`) | nilai yang diubah di proses PM2 tidak berpengaruh ke backup; dua sumber kebenaran env |

### 2.2 Yang sudah benar dan TIDAK dibuat ulang

| Kemampuan | Berkas | Catatan |
|---|---|---|
| Enkripsi dump (AES-256-GCM, scrypt, `PRIMABK1`) + gzip | `scripts/backup-db.js` | format sudah stabil; `backup-decrypt.js` pasangannya |
| Fail-closed tanpa `BACKUP_ENC_PASSWORD` (min 16) | `scripts/backup-db.js:88` | dump polos tidak boleh naik ke cloud |
| Antrean `backups-pending/` + retry run berikutnya | `scripts/backup-db.js` | jangan diganti mekanisme baru |
| Berkas Drive privat + proxy unduh ber-otorisasi per berkas | `app/api/upload/download/route.ts` (SDL-H4, L61, V5-AUTHZ-01) | jangan longgarkan |
| Validasi magic-number + allow-list MIME + `sniff_ok` | `app/api/upload/route.ts:57–127` | `sniff_ok=0` → served sebagai attachment |
| Sakelar modul untuk unggah & unduh | `lib/security/unggahan-modul.ts`, `kunciSakelarBerkas` | satu daftar modul untuk dua route (L78) |
| Rate limit unggahan 20/60 s per IP | `app/api/upload/route.ts:26` | dipertahankan |
| Pola status cadangan `{aktif, sudah, belum, terakhir}` | `lib/blud/cadangan-json.ts:30–37` | ditiru untuk kesehatan Drive, bukan dibuat gaya baru |
| Notifikasi in-app + antrean peran | `lib/services/notifications.ts` (`addNotif`, `NOTIF_SUPER_ADMIN`) | jalur peringatan yang sudah terbukti |

## 3. Prinsip rancangan

1. **Satu tempat untuk satu kebenaran.** Kredensial di satu modul; folder di satu
   resolver; hasil unggahan di satu tabel manifest. Salinan kedua selalu jadi sumber
   bug "yang satu sudah diganti, yang lain belum".
2. **Rahasia di env, alamat di database.** Client secret & refresh token hanya di
   `.env.local` server; ID folder boleh di `app_config` karena bukan rahasia dan justru
   harus bisa diganti operator tanpa deploy.
3. **ID, bukan tautan.** Tautan untuk manusia; API butuh folder ID. Menyimpan tautan
   berarti menulis pengurai URL yang rapuh terhadap perubahan bentuk tautan Google.
4. **Konfigurasi yang tidak diuji adalah konfigurasi yang diasumsikan.** Setiap tujuan
   punya tombol uji yang membuat, membaca, lalu menghapus berkas probe.
5. **Jangan menambah jalur kegagalan baru untuk menutup jalur lama.** Perubahan harus
   bisa ditinggalkan: kalau `app_config` kosong, perilaku hari ini (env) tetap jalan.
6. **Backup yang tidak pernah di-restore belum tentu backup.** Manifest mencatat sha256
   supaya restore bisa diverifikasi, bukan sekadar "ada filenya".

## 4. Arsitektur usulan

```
                  ┌──────────────────────────────────────────┐
  .env.local ────►│ lib/services/drive.ts                    │
  (3 kredensial)  │  getDriveClient()                        │
                  │  kodeGalatDrive()                        │
                  │  uploadBufferToDrive()                   │
                  │  infoKuota()  daftarBerkas()             │
                  │  pastikanFolder()                        │
                  └───────────────┬──────────────────────────┘
                                  │ dipakai oleh
        ┌─────────────┬───────────┼────────────┬──────────────┐
        ▼             ▼           ▼            ▼              ▼
  /api/upload   /api/upload/  lkjip/[id]/  lib/blud/     scripts/
  (usulan,BBA)  download      versi, impor cadangan-json backup-db.js
        │             │           │            │              │
        └─────────────┴───────────┴────────────┴──────────────┘
                                  │ tujuan folder
                                  ▼
                  ┌──────────────────────────────────────────┐
                  │ lib/services/drive-tujuan.ts             │
                  │  DRIVE_TUJUAN (daftar tetap)             │
                  │  folderUntuk(tujuan)                     │
                  │    app_config.drive_folder_<tujuan>      │
                  │      ▸ env GOOGLE_DRIVE_FOLDER_ID_*      │
                  │        ▸ GOOGLE_DRIVE_FOLDER_ID          │
                  └──────────────────────────────────────────┘
                                  │ hasil unggahan
                                  ▼
                  drive_arsip (manifest) + drive_health (kesehatan)
                                  │
                                  ▼
                     Admin Panel → tab "Drive & Backup"
```

## 5. Skema usulan

### 5.1 `app_config` (sudah ada, tidak diubah)

Tabel yang ada: `key VARCHAR(100) PK`, `value TEXT`, `updated_at`. Tidak perlu kolom
baru — cukup kunci baru:

| Kunci | Isi | Kosong berarti |
|---|---|---|
| `drive_root` | folder induk untuk mode subfolder otomatis | mode subfolder mati; pakai ID per tujuan |
| `drive_folder_backup_db` | folder dump harian | env `GOOGLE_DRIVE_FOLDER_ID_BACKUP` |
| `drive_folder_lkjip` | arsip versi & impor LKJIP | env `GOOGLE_DRIVE_FOLDER_ID_LKJIP` |
| `drive_folder_blud_json` | cadangan JSON BLUD | env `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` |
| `drive_folder_bba` | bukti & referensi harga BBA | env `GOOGLE_DRIVE_FOLDER_ID_BBA` |
| `drive_folder_usulan` | lampiran usulan | env `GOOGLE_DRIVE_FOLDER_ID` |
| `drive_last_test_at` | waktu uji terakhir (diisi endpoint Uji) | — |

Alasan `app_config` dan bukan tabel baru: sudah ada, sudah punya layar Admin, sudah
dipakai sakelar (`app_status_global`), dan satu baris `INSERT … ON DUPLICATE KEY
UPDATE` cukup untuk seluruh kebutuhan.

### 5.2 `drive_arsip` — manifest

```sql
CREATE TABLE IF NOT EXISTS drive_arsip (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tujuan        VARCHAR(40)  NOT NULL,           -- 'backup_db' | 'lkjip' | 'blud_json' | 'bba' | 'usulan'
  file_id       VARCHAR(64)  NOT NULL,
  nama          VARCHAR(255) NOT NULL,
  ukuran        BIGINT UNSIGNED NULL,            -- byte, dari Drive
  sha256        CHAR(64)     NULL,               -- dari isi SEBELUM enkripsi? lihat §9.2
  folder_id     VARCHAR(64)  NULL,               -- folder tempat ia ditaruh (jejak pindah folder)
  sumber        VARCHAR(20)  NOT NULL DEFAULT 'aplikasi', -- 'aplikasi' | 'backup_db'
  dibuat_pada   DATETIME     NOT NULL,
  dihapus_pada  DATETIME     NULL,               -- rotasi manual/otomatis, bukan DELETE baris
  PRIMARY KEY (id),
  UNIQUE KEY uq_drive_arsip_file (file_id),
  KEY idx_drive_arsip_tujuan (tujuan, dibuat_pada),
  KEY idx_drive_arsip_hapus (dihapus_pada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Baris **tidak** dihapus saat berkas dihapus dari Drive; `dihapus_pada` diisi. Tujuannya
supaya "berkas ini pernah ada dan kapan hilang" tetap bisa dijawab — audit yang bisa
dihapus bukan audit.

### 5.3 `drive_health` — satu baris per tujuan

```sql
CREATE TABLE IF NOT EXISTS drive_health (
  tujuan            VARCHAR(40) NOT NULL,
  terakhir_ok_at    DATETIME    NULL,
  terakhir_gagal_at DATETIME    NULL,
  pesan             VARCHAR(255) NULL,
  kode              VARCHAR(40)  NULL,   -- 'quota' | 'permission' | 'notfound' | 'token' | 'jaringan' | 'lain'
  jumlah_ok         INT UNSIGNED NOT NULL DEFAULT 0,
  jumlah_gagal      INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (tujuan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Ditulis oleh `/api/upload`, `lib/blud/cadangan-json.ts`, `versi` LKJIP, dan skrip
backup. Yang dibaca layar hanya empat nilai: tujuan, terakhir berhasil, terakhir gagal,
pesan. Itu cukup untuk menjawab "apakah backup semalam naik?".

### 5.4 Jenis audit baru

Wajib digolongkan di `lib/security/retensi-audit.ts` (`Record<AuditEventType, …>`,
kalau tidak, `tsc` gagal):

| Event | Kapan | Retensi yang diusulkan |
|---|---|---|
| `DRIVE_FOLDER_UBAH` | `drive_root` / `drive_folder_*` diubah dari Admin Panel | P (permanen, sama seperti perubahan konfigurasi) |
| `DRIVE_UJI` | tombol Uji dijalankan (hasil ringkas di `detail`) | S (sedang) |
| `DRIVE_BACKUP_JALAN` | tombol "jalankan backup sekarang" ditekan | S |

## 6. Kontrak modul & resolver

### 6.1 `lib/services/drive.ts` (satu-satunya pembuat klien)

```ts
export function getDriveClient(): drive_v3.Drive          // lempar bila env kurang
export function kodeGalatDrive(e: unknown): KodeDrive      // 'quota' | 'permission' | 'notfound' | 'token' | 'jaringan' | 'lain'
export async function uploadBufferToDrive(o: {
  buffer: Buffer; name: string; mimeType: string; folderId: string;
}): Promise<{ id: string; name: string; size: number | null }>
export async function infoKuota(): Promise<{ email: string | null; terpakai: number | null; batas: number | null }>
export async function pastikanFolder(path: string[]): Promise<string>   // §7
```

`uploadBufferToDrive` mengembalikan `size` supaya pemanggil bisa menulis manifest tanpa
memanggil Drive lagi. `kodeGalatDrive` tetap seperti sekarang (dipakai untuk pesan yang
bisa dibaca operator), hanya ditambah `token` untuk `invalid_grant`.

`/api/upload` dan `/api/upload/download` **menghapus** `getDriveClient` lokalnya dan
mengimpor dari sini. `scripts/backup-db.js` tetap punya klien sendiri karena berjalan di
luar Next (CommonJS, tanpa alias `@/`); perbedaannya didokumentasikan di kepala berkas
agar tidak dianggap salinan yang terlupa.

### 6.2 `lib/services/drive-tujuan.ts`

```ts
export const DRIVE_TUJUAN = ['backup_db','lkjip','blud_json','bba','usulan'] as const
export type DriveTujuan = (typeof DRIVE_TUJUAN)[number]

/** Urutan: app_config → env khusus → env umum. Kosong = '' (pemanggil yang memutuskan). */
export async function folderUntuk(tujuan: DriveTujuan): Promise<string>

/** Versi sinkron untuk uji unit: hanya env, tanpa DB. */
export function folderDariEnv(tujuan: DriveTujuan, env?: Record<string,string|undefined>): string
```

Pemetaan env yang dipertahankan (supaya server lama tidak perlu diubah):

| Tujuan | Env khusus | Fallback |
|---|---|---|
| `backup_db` | `GOOGLE_DRIVE_FOLDER_ID_BACKUP` | — (wajib; backup tidak boleh menulis ke folder umum) |
| `lkjip` | `GOOGLE_DRIVE_FOLDER_ID_LKJIP` | `GOOGLE_DRIVE_FOLDER_ID` |
| `blud_json` | `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` | — (panel memang menampilkan "belum dikonfigurasi") |
| `bba` | `GOOGLE_DRIVE_FOLDER_ID_BBA` | `GOOGLE_DRIVE_FOLDER_ID` |
| `usulan` | — | `GOOGLE_DRIVE_FOLDER_ID` |

`unggahan-modul.ts` tetap ada untuk urusan **sakelar** (modul mana yang memiliki berkas);
tugasnya menyusut: `folderUnggahan()` menjadi pembungkus `folderUntuk()` untuk modul
`usulan_aset` → `usulan` dan `buku_besar_aset` → `bba`. Uji `test-bba-referensi.mts`
(C17) harus tetap lulus — perilaku fallback-nya identik.

### 6.3 Aturan yang tidak boleh dilanggar

1. Tidak ada `process.env.GOOGLE_DRIVE_FOLDER_ID*` di luar `drive-tujuan.ts` dan
   `scripts/backup-db.js`. Bisa diuji statis seperti C17 sekarang.
2. Tidak ada `getDriveClient` kedua di `app/` atau `lib/`. Satu pengecualian yang
   didokumentasikan: `scripts/backup-db.js`.
3. Kegagalan menulis `drive_arsip`/`drive_health` **tidak** boleh menggagalkan unggahan
   (pola `uploaded_files` sekarang: silent-fail + `console.error`). Manifest adalah
   catatan, bukan pagar.

## 7. Folder induk & subfolder otomatis

### 7.1 Bentuk akhir

```
PRIMA/                     ← drive_root (ID disimpan di app_config)
  01-backup-db/            prima-db-2026-11-13-01-00.sql.gz.enc
  02-lkjip/                LKJIP-2026-v3.docx
  03-blud-json/            blud-json-2026-11-13T01-12-33.json
  04-bba-bukti/            bukti-harga-…jpg
  05-lampiran-usulan/      lampiran-usulan-…pdf
```

Tahun/bulan **di nama berkas**, bukan subfolder: rotasi tetap satu kueri
`name contains 'prima-db-'`, tidak ada folder kosong bertahun-tahun, dan struktur tidak
perlu diubah tiap Januari.

### 7.2 Aturan idempotensi (`pastikanFolder`)

1. Kalau `drive_folder_<tujuan>` sudah berisi ID → **pakai ID itu, jangan mencari**.
2. Kalau kosong dan `drive_root` kosong → jatuh ke env (§6.2). Tidak ada pencarian.
3. Kalau kosong dan `drive_root` terisi → `files.list` dengan
   `q = "'<root>' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '<nama>' and trashed = false"`,
   `fields = 'files(id,name)'`.
   - tepat 1 hasil → simpan ID-nya;
   - 0 hasil → `files.create` (mimeType folder) → simpan ID-nya;
   - >1 hasil → ambil yang **tertua** (`orderBy: 'createdTime'`), simpan, dan tulis
     peringatan di log (duplikat namanya adalah salah operator, bukan alasan gagal).
4. Simpan ke `app_config` + tulis audit `DRIVE_FOLDER_UBAH` dengan `detail` menyebut
   "dibuat otomatis".
5. Cache dalam memori proses 5 menit (pola yang sama dengan cache sakelar) supaya satu
   halaman tidak memanggil `files.list` berkali-kali.

### 7.3 Batas nyata yang harus disadari

- Dengan scope `drive.file`, aplikasi hanya melihat berkas **yang ia buat sendiri**.
  Folder induk yang dibuat manusia bisa menghasilkan `files.get` → 404, sehingga
  langkah 3 bisa "tidak menemukan" folder yang sebenarnya ada. Konsekuensinya: subfolder
  yang dibuat aplikasi aman (ia melihatnya), subfolder buatan manusia tidak.
- Kalau pemilik ingin sepenuhnya bebas, token harus ber-scope penuh `drive` untuk akun
  khusus backup. Ini keputusan §15 nomor 2, bukan default.
- Nama folder tidak unik. Karena itu ID disimpan dan pencarian hanya terjadi sekali.
- Folder dipindah/dihapus lalu dibuat ulang dengan nama sama = **ID baru**. Konfigurasi
  yang menyimpan ID lama akan menunjuk folder yang tidak ada. Karena itu §8 wajib ada.

## 8. Tombol Uji

### 8.1 Kontrak

`POST /api/admin/drive/uji` — **SUPER_ADMIN saja**, `isSameOriginRequest` wajib, rate
limit 1/30 detik per pengguna, diaudit (`DRIVE_UJI`).

```jsonc
// 200
{
  "ok": true,
  "akun": { "email": "prima.backup@…", "terpakai": 3221225472, "batas": 16106127360 },
  "tujuan": [
    { "tujuan": "backup_db", "ok": true,  "folderId": "1AbC…", "ms": 210 },
    { "tujuan": "bba",       "ok": false, "kode": "permission",
      "pesan": "Folder BBA tidak bisa ditulisi akun ini (403 insufficientPermissions)." },
    { "tujuan": "blud_json", "ok": false, "kode": "kosong",
      "pesan": "Folder belum dikonfigurasi (app_config & env kosong)." }
  ]
}
```

### 8.2 Yang dilakukan per tujuan

1. `folderUntuk(tujuan)` → kosong = `kode: 'kosong'`, tidak dianggap kegagalan sistem
   (hanya "belum dipakai").
2. `files.create` berkas probe `prima-uji-<uuid>.txt` isi `PRIMA-DRIVE-TEST <waktu>`,
   `fields: 'id,name,size'`.
3. `files.get(id, { fields: 'id,name,size' })` — membuktikan bisa dibaca kembali
   (bukan hanya ditulis).
4. `files.delete(id)` — probe **selalu** dihapus; kalau penghapusan gagal, laporkan
   `sisa_probe: <id>` supaya operator bisa membersihkan sendiri.
5. Tulis `drive_health` (ok/gagal + kode + pesan) dan `app_config.drive_last_test_at`.

Probe 40 byte, bukan dump: uji tidak boleh menghabiskan kuota, dan tidak boleh menyentuh
data PRIMA.

### 8.3 Yang **tidak** diuji endpoint

- Apakah isi berkas bisa didekripsi (itu tugas uji restore, §13).
- Apakah folder induk milik orang lain terlihat (dijelaskan di §7.3; hasil 404 bukan
  otomatis berarti unggahan akan gagal).

## 9. Integrasi skrip backup

### 9.1 Perubahan yang diusulkan (kecil, tidak mengubah format berkas)

| Bagian | Sekarang | Usulan |
|---|---|---|
| Folder tujuan | `requireEnv('GOOGLE_DRIVE_FOLDER_ID_BACKUP')` | `folderUntuk('backup_db')` via `app_config` (skrip membaca MySQL yang sama; kalau tabel belum ada → env) |
| Manifest | tidak ada | `INSERT INTO drive_arsip (…, sumber='backup_db')` setelah `UPLOAD-OK` |
| Kesehatan | tidak ada | `drive_health` `backup_db`: ok/gagal + kode |
| Rotasi | `name contains 'prima-db-'` → `slice(retention)` | `SELECT file_id FROM drive_arsip WHERE tujuan='backup_db' AND dibuat_pada < NOW() - INTERVAL ? DAY` → hapus yang itu saja → `dihapus_pada = NOW()` |
| Retensi | `BACKUP_RETENTION` = jumlah berkas (30) | tetap 30, tapi dihitung sebagai **hari**? lihat §15 nomor 4; default usulan: tetap "30 berkas terbaru" agar perilaku tidak berubah |
| Penanda "terakhir berhasil" | baris log | `drive_health.terakhir_ok_at` → dibaca Admin Panel |

Berkas di `backups-pending/` **tidak** masuk manifest sampai benar-benar naik: manifest
mencatat kenyataan Drive, bukan niat.

### 9.2 sha256: apa yang di-hash

`sha256` di `drive_arsip` = hash **berkas yang diunggah** (yaitu `.sql.gz.enc`), bukan
dump polos. Alasannya: verifikasi restore membandingkan byte yang diunduh dari Drive
dengan yang tercatat; hash dump polos tidak bisa dihitung ulang tanpa mendekripsi lebih
dulu. Kalau nanti ingin hash isi, tambahkan kolom `sha256_polos` — jangan mengubah arti
kolom yang sudah dipakai.

### 9.3 Yang tetap dipertahankan apa adanya

`loadEnv()` (§2.1 A13) tidak diubah di tahap ini: skrip memang dijalankan Task Scheduler
tanpa PM2, jadi membaca `.env.local` adalah desainnya. Yang ditambahkan hanya catatan di
`BACKUP-RESTORE.md`: kalau `app_config` dipakai, skrip butuh `MYSQL_*` yang sama.

## 10. Layar (Admin Panel)

Tab baru **"Drive & Backup"** di `app/(dashboard)/admin/_panels/TabDriveBackup.tsx`,
mengikuti pola `TabBroadcast`/`TabSecurityStatus` yang ada (tanpa pustaka baru, CSS
memakai `admin.css`).

| Blok | Isi | Sumber |
|---|---|---|
| Kartu akun | email akun Drive, kuota terpakai/batas, tombol **UJI SEKARANG** | `infoKuota()` + `POST /api/admin/drive/uji` |
| Tabel tujuan | 5 baris: nama, folder ID (dipotong), "Terakhir berhasil 3 jam lalu", "Terakhir gagal …", pesan | `drive_health` |
| Isian folder | `drive_root` + 5 `drive_folder_*`, tombol Simpan per baris, keterangan "kosong = ikut env" | `app_config` |
| Arsip backup | 10 baris terbaru: nama, ukuran, waktu, sha256 (8 karakter pertama), tombol unduh lewat proxy | `drive_arsip` |
| Peringatan | banner merah bila `terakhir_ok_at` > 36 jam untuk `backup_db` | turunan `drive_health` |

Tombol "jalankan backup sekarang" **tidak** diusulkan pada tahap 1–3: menjalankan
`mysqldump` dari dalam proses Next di Windows menambah jalur kegagalan baru (izin,
waktu lama, request menggantung). Yang ada cukup: status + perintah untuk dijalankan
manual (`node scripts/backup-db.js`) yang ditampilkan di layar. Kalau nanti dibutuhkan,
bentuknya job terpisah, bukan route yang menunggu dump selesai.

## 11. Prosedur pindah akun Google (tanpa menyentuh kode)

Dijalankan SUPER_ADMIN + orang yang memegang konsol Google Cloud.

1. **Siapkan akun tujuan.** Akun khusus backup (bukan akun pribadi staf), 2FA aktif,
   email pemulihan di bawah kendali IT.
2. **Buat folder induk** di akun itu (mis. `PRIMA`), lalu salin **ID**-nya dari URL
   (`…/folders/<ID>`), bukan seluruh tautannya.
3. **Buat OAuth client** (Desktop app) di project Google Cloud yang dipakai, lalu ambil
   refresh token dengan scope yang disepakati (§15 nomor 2) lewat OAuth Playground.
4. **Ganti tiga nilai** di `.env.local` server: `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`. Rahasia tidak pernah masuk
   repo.
5. **Isi `drive_root`** (dan/atau 5 `drive_folder_*`) di Admin Panel → Drive & Backup →
   Simpan.
6. **Klik UJI SEKARANG.** Semua tujuan yang dipakai harus `ok`. Kalau `permission` →
   folder belum dibagikan ke akun itu; kalau `token` → refresh token salah/dicabut;
   kalau `quota` → akun penuh.
7. **Jalankan backup manual**: `node scripts/backup-db.js` → cek `drive_health` berubah
   menjadi "baru saja" dan satu baris baru di `drive_arsip`.
8. **Unduh satu berkas** lewat proxy dari layar arsip, dekripsi dengan
   `backup-decrypt.js`, lalu hapus hasil dekripsi.
9. **Arsip lama tidak dipindahkan.** Biarkan di akun lama sampai retensi habis; simpan
   akses ke akun lama minimal 30 hari sesudah pindah.

Rollback: kembalikan tiga env + folder ID lama. Karena berkas lama tidak disentuh,
rollback tidak kehilangan data.

### 11.1 Selama akun masih dipegang satu orang (kondisi hari ini)

Yang dipegang perorangan bukan folder-nya, melainkan **refresh token**-nya: token itu
melekat pada akun Google orang yang membuatnya. Selama orang itu masih di kantor,
semuanya jalan tanpa keluhan — dan justru karena itu risikonya tidak terasa sampai hari
serah terima.

Yang **tidak** ikut berubah saat pindah server atau pindah akun:

- Folder dan berkasnya. Alamatnya ditentukan folder ID, dan folder ID tidak berubah
  karena servernya diganti. Tautan yang dibagikan ke orang lain tetap menunjuk berkas
  yang sama.
- Isi arsip lama. Tidak ada yang dipindahkan otomatis; yang baru naik ke folder baru.

Yang **ikut mati** kalau akunnya hilang: unggahan berikutnya (bukan yang sudah ada).
Gejalanya `invalid_grant`, dan semua modul yang menulis ke Drive berhenti bersamaan.

Karena itu tiga hal ini lebih penting daripada kerapian konfigurasi:

1. **Akun milik institusi, bukan milik orang.** Alamatnya berpola jabatan (mis.
   `prima.backup@…`), pemulihan (email sekunder + nomor telepon) di bawah kendali IT,
   dan kata sandinya di tempat yang bisa dibuka atasan langsung — bukan hanya di ponsel
   satu orang.
2. **Serah terima = 3 nilai + 1 klik.** Cukup `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` diganti, folder ID di
   `app_config` tetap, lalu **Uji** harus hijau. Ini alasan §5.2 memisahkan rahasia (env)
   dari alamat (database): yang berpindah tangan hanya rahasianya.
3. **Catat siapa pemegangnya.** Satu baris di `docs/BACKUP-RESTORE.md` (nama, tanggal,
   di mana kredensial disimpan) sudah cukup untuk membuat serah terima tidak bergantung
   pada ingatan orang. Kalau pemegangnya pensiun tanpa catatan itu, yang tersisa hanya
   arsip yang tidak bisa ditambah.

## 12. Yang diputuskan TIDAK dikerjakan

1. **Tidak menyimpan tautan Drive** di file konfigurasi, database, atau repo. Yang
   disimpan selalu folder ID / file ID.
2. **Tidak menaruh kredensial di `app_config`.** Client secret & refresh token tetap
   hanya di `.env.local`; `app_config` bisa dibaca siapa pun yang punya akses DB.
3. **Tidak membuat berkas konfigurasi JSON baru di repo** (mis. `config/drive.json`).
   Itu memindahkan masalah, bukan menyelesaikannya: tetap butuh deploy untuk berubah.
4. **Tidak mengubah struktur folder yang sudah dipakai** secara otomatis. Migrasi folder
   lama → subfolder baru hanya lewat tindakan operator, dan berkas lama tidak dipindah
   oleh kode.
5. **Tidak menambah sinkronisasi dua arah / penghapusan massal.** Drive tetap tempat
   arsip; kebenaran data tetap di MySQL.
6. **Tidak memakai service account** pada tahap ini. Service account tidak punya kuota
   sendiri dan tidak bisa memiliki berkas; ke My Drive hasilnya `403
   storageQuotaExceeded` walau folder sudah dibagikan Editor. Ia hanya masuk akal di
   Shared Drive (§15 nomor 1).
7. **Tidak membuat dashboard pemantauan Drive realtime** (SSE). Cukup baca saat tab
   dibuka + tombol Uji.
8. **Tidak menyentuh `sniff_ok`, allow-list MIME, rate limit, atau aturan otorisasi
   unduhan.** Itu bukan bagian pekerjaan ini.

## 13. Risiko & jebakan

| Risiko | Kenapa berbahaya | Pagar |
|---|---|---|
| Refresh token dicabut (`invalid_grant`) | backup & unggahan berhenti tanpa suara; gejalanya baru terasa saat butuh restore | `drive_health` + banner >36 jam; tombol Uji memetakan `invalid_grant` → `kode: 'token'` |
| Kuota akun pribadi 15 GB penuh | unggahan gagal serentak di semua modul | `infoKuota()` di kartu akun; peringatan bila >80% |
| Folder dipindah/dihapus lalu dibuat ulang | ID lama menunjuk folder yang tidak ada; unggahan gagal 404 | Uji + `drive_health`; banner, bukan asumsi |
| Rotasi menghapus berkas yang salah | kehilangan arsip | rotasi hanya berdasarkan `drive_arsip`; `dihapus_pada` mencatat jejak |
| Dua proses backup bersamaan | dua dump, dua rotasi, saling menghapus | kunci berkas (`backups-pending/.lock`) pada tahap 2 |
| `BACKUP_ENC_PASSWORD` hilang | seluruh arsip Drive tidak bisa dibuka | sudah didokumentasikan (`BACKUP-RESTORE.md` §Setup 2) — pertahankan |
| Akun Drive dipakai bersama staf | staf bisa menghapus arsip dari UI Drive | akun khusus, tanpa akses Drive penuh untuk staf; folder tidak dibagikan "siapa pun yang punya tautan" |
| Berkas lampiran hanya ada di Drive | akun bermasalah = lampiran usulan hilang | salinan kedua berkala (§15 nomor 5) |
| Manifest dianggap pengganti uji restore | "ada di manifest" ≠ "bisa dipulihkan" | uji restore 6 bulan (`BACKUP-RESTORE.md`) tetap wajib |

## 14. Fase eksekusi & DoD

### Tahap 1 — Satu pintu (tanpa tabel baru)

- `lib/services/drive.ts` menjadi satu-satunya klien + `uploadBufferToDrive` mengembalikan `size`.
- `/api/upload` & `/api/upload/download` menghapus `getDriveClient` lokal.
- `lib/services/drive-tujuan.ts` + `folderUntuk()`; `versi` LKJIP, `impor` LKJIP, dan
  `cadangan-json` memakainya; `unggahan-modul.ts` menjadi pembungkus.
- `docs/PANDUAN-pemasangan-windows.md` dilengkapi `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON`
  dan catatan `BACKUP_ENC_PASSWORD`.
- **DoD**: `eslint` 0 warning, `tsc` hijau, `test-bba-referensi.mts` (C17) lulus,
  uji statis baru "tidak ada `process.env.GOOGLE_DRIVE_FOLDER_ID` di luar
  `drive-tujuan.ts` & skrip" lulus, unggah & unduh satu berkas nyata berhasil.

### Tahap 2 — Uji & manifest

- Migrasi `drive_arsip`, `drive_health` (+ entri `docs/schema-mysql.sql`).
- `POST /api/admin/drive/uji`, penulisan `drive_health` dari keempat jalur unggah.
- Skrip backup menulis manifest + `drive_health`; rotasi berbasis manifest; kunci anti-tumpang-tindih.
- **DoD**: migrasi dijalankan di DB uji; Uji hijau untuk 3 tujuan dan gagal-terbaca
  untuk folder yang sengaja dikosongkan; backup manual menghasilkan 1 baris manifest;
  rotasi tidak menyentuh berkas di luar manifest; audit `DRIVE_UJI` tercatat.

### Tahap 3 — Layar & subfolder otomatis

- `TabDriveBackup.tsx` + route baca `GET /api/admin/drive/status`.
- `pastikanFolder()` + `drive_root` + audit `DRIVE_FOLDER_UBAH`.
- **DoD**: panel menampilkan kuota, 5 tujuan, 10 arsip terbaru; banner muncul bila
  `backup_db` basi >36 jam; mode `drive_root` membuat subfolder sekali dan memakai ID
  itu pada unggahan berikutnya (dibuktikan dengan dua kali unggah: tidak ada folder
  kedua).

Perkiraan: ± 1 hari per tahap. Tahap 1 tidak bergantung pada persetujuan skema; Tahap
2–3 menunggu §15.

## 15. Keputusan yang perlu persetujuan pemilik sebelum Tahap 2

1. **Akun Drive**: akun pribadi ber-refresh-token (cukup; kuota 15 GB; token bisa
   dicabut) atau **Shared Drive** Workspace + service account (kuota organisasi, tidak
   mati saat staf keluar; butuh Workspace).
2. **Scope token**: `drive.file` (aman, tapi tidak bisa membaca folder buatan manusia —
   §7.3) atau `drive` penuh untuk akun khusus backup.
3. **Mode folder**: 5 ID terpisah seperti sekarang, atau satu `drive_root` + subfolder
   otomatis.
4. **Retensi backup**: tetap "30 berkas terbaru" (perilaku hari ini) atau berubah menjadi
   "30 hari" (lebih mudah dijelaskan, tetapi jumlah berkas bisa membengkak bila backup
   dijalankan manual berkali-kali).
5. **Salinan kedua lampiran** di luar Drive: dikerjakan sekarang, atau dicatat sebagai
   risiko yang diterima.
6. **Isi panel**: apakah tab "Drive & Backup" cukup, atau backup perlu tab sendiri
   terpisah dari konfigurasi folder.

## 16. Lampiran — peta env Drive hari ini

Dari `.env.example` L38–53 (semua dipertahankan; tidak ada yang dihapus):

| Variabel | Dipakai di | Wajib? |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | `lib/services/drive.ts`, `/api/upload`, `/api/upload/download`, `scripts/backup-db.js` | ya, untuk semua fitur Drive |
| `GOOGLE_OAUTH_CLIENT_SECRET` | idem | ya |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | idem | ya |
| `GOOGLE_DRIVE_FOLDER_ID` | lampiran usulan (+ fallback LKJIP & BBA) | ya, bila memakai unggahan |
| `GOOGLE_DRIVE_FOLDER_ID_LKJIP` | `versi` & `impor` LKJIP | tidak (fallback ke folder umum setelah Tahap 1) |
| `GOOGLE_DRIVE_FOLDER_ID_BBA` | `/api/upload` untuk `buku_besar_aset` | tidak (fallback) |
| `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` | `lib/blud/cadangan-json.ts` | tidak (panel menampilkan "belum dikonfigurasi") |
| `GOOGLE_DRIVE_FOLDER_ID_BACKUP` | `scripts/backup-db.js` | ya, untuk backup |
| `BACKUP_ENC_PASSWORD` | `scripts/backup-db.js`, `backup-decrypt.js` | ya (min 16 char) |
| `BACKUP_RETENTION` | `scripts/backup-db.js` | tidak (default 30) |
| `MYSQLDUMP_PATH` | `scripts/backup-db.js` | tidak (default `mysqldump` di PATH) |

Yang belum terverifikasi dan perlu dicek pemilik sebelum Tahap 1 dieksekusi:

1. **Scope token yang sekarang beredar** — tidak bisa dibaca dari repo (melekat pada
   token, bukan pada kode). Menentukan apakah §7.2 langkah 3 bisa diandalkan.
2. **Apakah ada baris `file_url` lama yang berisi tautan `drive.google.com`** —
   **sudah diperiksa 13 Nov 2026** pada DB pengembangan `prima_db_3`: 0. Rinciannya di
   §16.1. DB **produksi belum diperiksa** (tidak terjangkau dari mesin pengembangan);
   jalankan kueri yang sama di sana sebelum menyimpulkan.
3. **Apakah `GOOGLE_DRIVE_FOLDER_ID_BACKUP` dan `_BLUD_JSON` sudah terisi di server
   produksi** — menentukan apakah Tahap 2 langsung berguna atau perlu setup akun dulu.

### 16.1 Pemeriksaan tautan Drive di data (13 November 2026)

Dijalankan read-only pada `prima_db_3` (MySQL 8.4.3). Tidak ada baris yang diubah.

| Tabel | Baris | Memuat `drive.google.com` |
|---|---|---|
| `usulan_items.file_url` | 6 (6 usulan, 4 header) | 0 — juga 0 URL proxy `/api/upload/download` |
| `usulan_items.url_merk1..3` | 6 | 0 |
| `bba_lampiran.url` / `bba_referensi_harga.url` / `bba_penerimaan.url` | 0 / 0 / 0 | 0 |
| `lkjip_versi.drive_file_id` | 0 | 0 (belum ada arsip Drive) |
| `blud_riwayat_simpan.drive_file_id` | 44 | 0 (semua belum naik) |
| `uploaded_files` | 2 | — (menyimpan `file_id`, bukan URL) |

Kueri untuk dijalankan di produksi (ganti `prima_db_3` bila namanya beda):

```sql
SELECT 'usulan_items.file_url' AS tempat,
       COUNT(*) AS baris,
       SUM(file_url LIKE '%drive.google.com%') AS tautan_drive
  FROM usulan_items
UNION ALL SELECT 'usulan_items.merk', COUNT(*),
       SUM(CONCAT_WS(' ', url_merk1, url_merk2, url_merk3) LIKE '%drive.google.com%')
  FROM usulan_items
UNION ALL SELECT 'bba_lampiran', COUNT(*), SUM(url LIKE '%drive.google.com%') FROM bba_lampiran
UNION ALL SELECT 'bba_referensi_harga', COUNT(*), SUM(url LIKE '%drive.google.com%') FROM bba_referensi_harga
UNION ALL SELECT 'bba_penerimaan', COUNT(*), SUM(url LIKE '%drive.google.com%') FROM bba_penerimaan;
```

Arti hasilnya: **0** berarti A8 cukup penyesuaian label (tautan lama tidak ada, jadi
tidak ada yang menuntut izin akses). **>0** berarti ada lampiran yang hanya bisa dibuka
pemiliknya — perlu diputuskan: dibiarkan (berkasnya toh ada di Drive akun itu) atau
diunggah ulang lewat `/api/upload` agar pindah ke proxy. Itu keputusan data, bukan
pekerjaan Tahap 1.
