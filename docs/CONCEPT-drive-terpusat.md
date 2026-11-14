# Konsep — Drive Terpusat PRIMA (satu pintu kredensial & tujuan)

> Status: **Tahap 1–3 DIKERJAKAN 14 November 2026** (§18 folder induk, §19 manifest, Uji,
> panel, §20 salinan kedua lampiran). Keputusan §15 yang belum dijawab pemilik diisi pilihan yang tidak mengubah
> perilaku (§19.1). Direvisi 14 November 2026
> sesudah dicocokkan ulang dengan kode — daftar koreksi & pengembangan di **§17**; yang
> terpenting: pindah akun Google ternyata MEMUTUS berkas lama (§2.1 A15, §11).
> Dokumen ini mencatat hasil
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
| Folder tujuan | 4 tempat membaca env: resolver `folderUnggahan()` (dipakai `/api/upload` DAN impor Word LKJIP), `GOOGLE_DRIVE_FOLDER_ID_LKJIP` langsung di arsip versi, `_BLUD_JSON` langsung, `_BACKUP` di skrip | 1 resolver `folderUntuk(tujuan)`; `app_config` dulu, env sebagai cadangan |
| Ganti akun Google | sunting 3 berkas TS + 1 skrip + 4–5 env — **dan berkas lama berhenti terbaca** (A15) | ganti 3 env + bagikan folder lama ke akun baru + isi folder di Admin Panel + **Uji** (termasuk "baca berkas lama", §8.2) |
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
| A1 | Klien OAuth ditulis empat kali | `lib/services/drive.ts:8`, `app/api/upload/route.ts:62`, `app/api/upload/download/route.ts:20`, `scripts/backup-db.js:116` | ganti akun = 4 suntingan; satu terlewat = jalur itu mati diam-diam (pola L69: perbaikan tidak kena semua jalur) |
| A2 | Folder tujuan dibaca di empat tempat (lima pemanggil) | `lib/security/unggahan-modul.ts:36` (dipakai `/api/upload` + `app/api/lkjip/impor/route.ts:66`), `app/api/lkjip/[id]/versi/route.ts:49`, `lib/blud/cadangan-json.ts:46`, `scripts/backup-db.js:156` | fallback "kosong → folder umum" berlaku di unggahan & impor LKJIP; arsip versi LKJIP, cadangan BLUD, dan backup tidak |
| A3 | `PANDUAN-pemasangan-windows.md` tidak menyebut `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` | panduan L145–156 hanya 4 variabel folder | server baru mengikuti panduan → panel cadangan JSON BLUD selamanya "belum dikonfigurasi" |
| A4 | Tidak ada indikator kesehatan backup DB di aplikasi | panel BLUD punya `{aktif, sudah, belum, terakhir}`; backup DB hanya menulis `scripts/backup-db.log` (gitignored) | cron mati berbulan-bulan tanpa ada yang tahu — gejala yang sama dengan masalah cadangan BLUD dulu |
| A5 | Hasil unggahan backup tidak tercatat di database | skrip hanya `log('UPLOAD-OK', …)` | tidak ada manifest; restore bergantung "cari-cari di Drive" |
| A6 | Rotasi berbasis nama berkas | `name contains 'prima-db-'` lalu hapus `slice(retention)` | salinan arsip manual dengan awalan sama bisa ikut terhapus; dua proses bersamaan bisa saling menghapus |
| A7 | `uploaded_files` tidak menyimpan nama/ukuran | schema: `file_id, uploaded_by, context, sniff_ok, created_at` | daftar berkas tidak bisa ditampilkan tanpa memanggil Drive per baris |
| A8 | UI usulan memilih teks label dari isi URL (`file_url.includes('drive.google.com')` → "Lihat di Google Drive") | `BuatPanel.tsx:419`, `DetailModal.tsx:231` | **Dampak hari ini nol**: berkas baru menyimpan URL proxy `/api/upload/download`, dan pemeriksaan 13 Nov 2026 menemukan **0** baris bertautan Drive di `prima_db_3` (§16.1). Jadi ini bukan temuan berisiko, hanya label yang memilih teks dari isi URL. Produksi belum diperiksa |
| A9 | Kuota akun tidak pernah dibaca | `about.get` tidak dipakai di mana pun | kuota penuh baru ketahuan saat unggahan gagal |
| A10 | Konfigurasi Drive tidak bisa diaudit | semuanya env | tidak ada jejak siapa mengganti folder & kapan |
| A11 | Backup hanya MySQL | `mysqldump --databases` | lampiran usulan, bukti BBA, dan docx LKJIP tidak punya salinan kedua |
| A12 | Token ber-scope `drive.file` tidak bisa membaca folder milik pemilik | `CONCEPT-bba-perencanaan.md:201` (`files.get` → 404) | "cari folder berdasarkan nama, kalau tidak ada buat" tidak andal untuk folder induk buatan orang |
| A13 | `scripts/backup-db.js` memuat `.env.local` sendiri | L38–L52 (`loadEnv`) | nilai yang diubah di proses PM2 tidak berpengaruh ke backup; dua sumber kebenaran env |
| A14 | LKJIP satu modul, dua aturan folder | gambar editor (`/api/upload` modul `lkjip`) & impor Word (`folderUnggahan('lkjip')`) → folder UMUM, karena `ENV_FOLDER_KHUSUS` hanya memuat BBA; arsip versi → `_LKJIP` saja, tanpa cadangan | `GOOGLE_DRIVE_FOLDER_ID_LKJIP` yang diisi operator tidak menampung gambar LKJIP; mereka bercampur dengan lampiran usulan |
| A15 | **Berkas lama terikat pada akun & aplikasi yang membuatnya** | ID berkas disimpan di 9 tempat (§16.2) dan dibaca lewat token aplikasi (`/api/upload/download`, gambar Word LKJIP di `docgen.ts:798`); token ber-scope `drive.file` hanya melihat berkas buatan aplikasi OAuth itu (`CONCEPT-bba-perencanaan.md:201`) | ganti akun Google — atau ganti OAuth client ke project lain — membuat SEMUA lampiran usulan, bukti BBA, dan gambar LKJIP lama 404 lewat proxy, dan Word LKJIP kehilangan gambarnya. §11.1 versi pertama keliru menyebut berkas lama "tidak ikut berubah" |
| A16 | Nama berkas backup memakai jam UTC | `new Date().toISOString()` di `scripts/backup-db.js` | backup 01.00 WIB bernama `prima-db-<kemarin>-18-00`; contoh `prima-db-2026-07-02-01-00` di `BACKUP-RESTORE.md` menyesatkan saat memilih berkas untuk restore |
| A17 | Server tidak selalu menyala (malam & akhir pekan) | tugas backup `Daily 01.00` (`BACKUP-RESTORE.md`) baru jalan saat server menyala lagi bila dipasang "jalankan sesegera mungkin" | ambang tetap "> 36 jam" (§10 versi pertama) menyalakan banner merah tiap Senin pagi — alarm palsu yang melatih orang mengabaikannya |

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
| `drive_folder_lkjip` | arsip versi, gambar editor & impor Word LKJIP | env `GOOGLE_DRIVE_FOLDER_ID_LKJIP` |
| `drive_folder_blud_json` | cadangan JSON BLUD | env `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` |
| `drive_folder_bba` | bukti & referensi harga BBA | env `GOOGLE_DRIVE_FOLDER_ID_BBA` |
| `drive_folder_usulan` | lampiran usulan | env `GOOGLE_DRIVE_FOLDER_ID` |
| `drive_last_test_at` | waktu uji terakhir (diisi endpoint Uji) | — |

`lkjip` dan `lkjip_arsip` berbagi SATU kunci (`drive_folder_lkjip`) — keduanya folder LKJIP;
yang berbeda hanya cadangannya bila kosong (§6.2).

Alasan `app_config` dan bukan tabel baru: sudah ada, sudah punya layar Admin, sudah
dipakai sakelar (`app_status_global`), dan satu baris `INSERT … ON DUPLICATE KEY
UPDATE` cukup untuk seluruh kebutuhan.

### 5.2 `drive_arsip` — manifest

```sql
CREATE TABLE IF NOT EXISTS drive_arsip (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tujuan        VARCHAR(40)  NOT NULL,           -- 'backup_db' | 'lkjip' | 'lkjip_arsip' | 'blud_json' | 'bba' | 'usulan'
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
| `DRIVE_FOLDER_UBAH` | `drive_root` / `drive_folder_*` diubah dari Admin Panel | `P` = PANJANG (5 tahun) — perubahan konfigurasi |
| `DRIVE_UJI` | tombol Uji dijalankan (hasil ringkas di `detail`) | `S` = PENDEK (12 bulan) — pekerjaan sistem |

Hanya dua kelas yang ada di `retensi-audit.ts`: `P` = PANJANG 5 tahun, `S` = PENDEK
12 bulan (versi pertama dokumen ini menyebut "permanen" & "sedang" — keduanya tidak ada).
`DRIVE_BACKUP_JALAN` dibuang: tombolnya sendiri tidak diusulkan (§10).

## 6. Kontrak modul & resolver

### 6.1 `lib/services/drive.ts` (satu-satunya pembuat klien)

```ts
export function getDriveClient(): drive_v3.Drive          // lempar bila env kurang
export function kodeGalatDrive(e: unknown): number | null   // SUDAH ADA — kode HTTP; jangan diubah
export function jenisGalatDrive(e: unknown): JenisGalatDrive // BARU: 'quota' | 'permission' | 'notfound' | 'token' | 'jaringan' | 'lain'
export async function uploadBufferToDrive(o: {
  buffer: Buffer; name: string; mimeType: string; folderId: string;
}): Promise<{ fileId: string; name: string; size: number | null }>
export async function infoKuota(): Promise<{ email: string | null; terpakai: number | null; batas: number | null }>
export async function pastikanFolder(path: string[]): Promise<string>   // §7
```

`uploadBufferToDrive` menambah `size` (fields `id,name,size`) supaya pemanggil bisa menulis
manifest tanpa memanggil Drive lagi; nama `fileId` DIPERTAHANKAN — tiga pemanggil
(`cadangan-json`, impor & versi LKJIP) sudah membacanya. **Koreksi**: `kodeGalatDrive` hari
ini memulangkan **kode HTTP** (`number | null`), bukan jenis bertulisan; `/api/upload/download`
membandingkannya dengan `404` (berkas hilang → 404, bukan 500). Jenis untuk pesan operator dibuat fungsi BARU
`jenisGalatDrive` di atasnya (403 + `storageQuotaExceeded` → `quota`, 403 lain →
`permission`, 404 → `notfound`, `invalid_grant` → `token`, tanpa kode HTTP → `jaringan`);
`kodeGalatDrive` tidak diubah arti.

`/api/upload` dan `/api/upload/download` **menghapus** `getDriveClient` lokalnya dan
mengimpor dari sini. `scripts/backup-db.js` tetap punya klien sendiri karena berjalan di
luar Next (CommonJS, tanpa alias `@/`); perbedaannya didokumentasikan di kepala berkas
agar tidak dianggap salinan yang terlupa.

### 6.2 `lib/services/drive-tujuan.ts`

```ts
export const DRIVE_TUJUAN = ['backup_db','lkjip','lkjip_arsip','blud_json','bba','usulan'] as const
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
| `lkjip` (gambar editor, impor Word) | `GOOGLE_DRIVE_FOLDER_ID_LKJIP` | `GOOGLE_DRIVE_FOLDER_ID` |
| `lkjip_arsip` (docx Simpan Versi) | `GOOGLE_DRIVE_FOLDER_ID_LKJIP` | — (perilaku hari ini: kosong = tidak diarsipkan, layar menyebut "belum dikonfigurasi") |
| `blud_json` | `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` | — (panel memang menampilkan "belum dikonfigurasi") |
| `bba` | `GOOGLE_DRIVE_FOLDER_ID_BBA` | `GOOGLE_DRIVE_FOLDER_ID` |
| `usulan` | — | `GOOGLE_DRIVE_FOLDER_ID` |

`unggahan-modul.ts` tetap ada untuk urusan **sakelar** (modul mana yang memiliki berkas);
tugasnya menyusut: `folderUnggahan()` menjadi pembungkus `folderUntuk()` untuk modul
`usulan_aset` → `usulan`, `buku_besar_aset` → `bba`, dan `lkjip` → `lkjip`. Uji
`test-bba-referensi.mts` (C17) harus tetap lulus — perilaku BBA identik.

**Satu perubahan perilaku yang disengaja (A14)**: gambar editor & impor Word LKJIP yang
diunggah SESUDAH Tahap 1 masuk folder `_LKJIP` bila env itu terisi (hari ini selalu ke folder
umum). Berkas lama tidak dipindah — ia dibaca lewat ID, bukan folder, jadi tetap terbuka.
Arsip versi (`lkjip_arsip`) dipisah supaya tidak tiba-tiba ikut cadangan "folder umum" dan
menaruh docx arsip di antara lampiran usulan.

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
  khusus PRIMA. Ini keputusan §15 nomor 2 — dan sejak revisi §17 menjadi sarannya, karena
  pindah akun juga butuh scope itu (§11.0).
- Nama folder tidak unik. Karena itu ID disimpan dan pencarian hanya terjadi sekali.
- Folder dipindah/dihapus lalu dibuat ulang dengan nama sama = **ID baru**. Konfigurasi
  yang menyimpan ID lama akan menunjuk folder yang tidak ada. Karena itu §8 wajib ada.

## 8. Tombol Uji

### 8.1 Kontrak

`POST /api/admin/drive/uji` — **SUPER_ADMIN saja**, pola route admin yang sudah ada
(`getSession()` + peran, `checkRateLimit` 1/30 detik per pengguna — cermin
`/api/admin/pemeliharaan`), diaudit (`DRIVE_UJI`). Koreksi: versi pertama menyebut
`isSameOriginRequest` — fungsi itu **tidak ada** di repo; perlindungan CSRF route admin
hari ini = cookie sesi `SameSite=Lax` (`lib/security/auth.ts:166`) + badan JSON. Kalau
pemeriksaan Origin dianggap perlu, itu pekerjaan lintas-route tersendiri, bukan bagian ini.

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
5. **Baca berkas lama** (pengembangan, A15): ambil ID berkas TERTUA dan TERBARU yang
   tercatat untuk tujuan itu (§16.2 — mis. `uploaded_files` ber-`context` modulnya,
   `lkjip_versi.drive_file_id`, `blud_riwayat_simpan.drive_file_id`, `drive_arsip` untuk
   backup) lalu `files.get(id, { fields: 'id' })` — metadata saja, tanpa mengunduh isi.
   404/403 = "berkas lama tidak terbaca akun ini" (`kode: 'lama_tak_terbaca'`). Langkah 2–4
   hanya membuktikan akun bisa MENULIS berkas baru; hanya langkah ini yang menangkap pindah
   akun yang memutus lampiran lama. Tujuan tanpa berkas tercatat = dilewati, bukan gagal.
6. Tulis `drive_health` (ok/gagal + kode + pesan) dan `app_config.drive_last_test_at`.

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
| Nama berkas | `prima-db-<jam UTC>` (A16) | `prima-db-<jam WIB>` lewat `waktu-wib`; rotasi tetap memakai awalan `prima-db-`, dekripsi tidak bergantung nama |
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
| Tabel tujuan | 6 baris: nama, folder ID (dipotong), "Terakhir berhasil 3 jam lalu", "Terakhir gagal …", pesan | `drive_health` |
| Isian folder | `drive_root` + 5 `drive_folder_*` (`lkjip` & `lkjip_arsip` berbagi satu), tombol Simpan per baris, keterangan "kosong = ikut env" | `app_config` |
| Arsip backup | 10 baris terbaru: nama, ukuran, waktu, sha256 (8 karakter pertama), tombol unduh lewat proxy | `drive_arsip` |
| Peringatan | banner merah bila backup **hari ini belum naik padahal server sudah hidup ≥ 2 jam hari ini**, atau bila terakhir berhasil > 4 hari | turunan `drive_health` + waktu proses mulai |

**Kenapa bukan "> 36 jam" (A17)**: server kantor tidak menyala 24 jam, dan tugas backup
01.00 baru jalan sesudah server menyala. Ambang jam tetap berbunyi tiap Senin pagi —
alarm yang selalu salah melatih orang mengabaikannya, persis saat ia benar. Aturannya
(fungsi murni `backupBasi(terakhirOk, prosesMulai, sekarang)`, semua tanggal WIB lewat
`lib/shared/waktu-wib.ts`):

- **merah** — belum ada backup berhasil bertanggal hari ini, DAN aplikasi sudah hidup
  ≥ 2 jam hari ini (`prosesMulai` = waktu proses Next mulai; kalau proses dimulai kemarin,
  dihitung dari 00.00). Restart siang hari karena pembaruan tidak memicu alarm palsu,
  sebab backup pagi itu sudah bertanggal hari ini.
- **merah** — terakhir berhasil > 4 hari (jaring kedua: libur panjang tetap tertangkap
  begitu server dinyalakan, dan aturan pertama tak pernah jalan kalau `drive_health`
  belum pernah terisi).
- selain itu **tanpa warna** — cukup tulisan "Terakhir berhasil …".

Tombol "jalankan backup sekarang" **tidak** diusulkan pada tahap 1–3: menjalankan
`mysqldump` dari dalam proses Next di Windows menambah jalur kegagalan baru (izin,
waktu lama, request menggantung). Yang ada cukup: status + perintah untuk dijalankan
manual (`node scripts/backup-db.js`) yang ditampilkan di layar. Kalau nanti dibutuhkan,
bentuknya job terpisah, bukan route yang menunggu dump selesai.

## 11. Prosedur pindah akun Google (tanpa menyentuh kode)

Dijalankan SUPER_ADMIN + orang yang memegang konsol Google Cloud.

### 11.0 Yang menentukan: berkas LAMA, bukan berkas baru (koreksi A15)

PRIMA tidak pernah menyimpan berkas di server — yang disimpan **ID berkas Drive** (9 tempat,
§16.2), dan setiap kali orang membuka lampiran, bukti BBA, atau mengunduh Word LKJIP
bergambar, server MEMBACA berkas itu dengan token aplikasi yang sedang terpasang. Jadi
setelah pindah, token baru harus bisa membaca berkas yang dibuat token lama. Tiga keadaan:

| Yang diganti | Berkas lama | Kenapa |
|---|---|---|
| Refresh token saja (akun & OAuth client sama) | tetap terbaca | aplikasi & pemiliknya sama |
| OAuth client baru, akun sama | **berisiko** dengan scope `drive.file`: hak bacanya melekat pada aplikasi (project Google Cloud) yang membuat berkas; client di project lain pasti kehilangan, di project yang sama belum dipastikan — §8.2 langkah 5 yang membuktikan | scope `drive.file` |
| **Akun Google baru** | **404 semua**, kecuali (a) folder lama DIBAGIKAN ke akun baru dan (b) token akun baru ber-scope `drive` penuh | berkas milik akun lama; `drive.file` akun baru hanya melihat buatannya sendiri |

**Jangan menyalin berkas ke akun baru.** Salinan = ID baru, sedangkan ID lama tersimpan di
9 tempat (termasuk di dalam JSON blok LKJIP) — menyalin berarti memutus semua rujukan itu
kecuali ada migrasi ID yang tidak diusulkan di sini. Yang benar: berkas tetap di tempatnya,
aksesnya yang dibagikan (atau kepemilikannya dialihkan lewat fitur "transfer ownership"
Google — tetap butuh scope `drive` karena berkas itu bukan buatan aplikasi untuk akun baru).

Akibatnya untuk §15 nomor 2: kalau pindah akun pernah mungkin terjadi — dan menurut §11.1
pasti suatu hari terjadi — scope `drive` penuh untuk **akun khusus PRIMA** bukan pilihan
kenyamanan, melainkan satu-satunya jalan berkas lama tetap terbuka.

### 11.1 Langkah

1. **Siapkan akun tujuan.** Akun khusus PRIMA (bukan akun pribadi staf), 2FA aktif,
   email pemulihan di bawah kendali IT.
2. **Bagikan folder lama ke akun tujuan** (Editor) dari akun lama — SEMUA folder yang
   pernah dipakai (umum, LKJIP, BBA, BLUD JSON, backup). Tanpa ini langkah 7 merah.
3. **Buat folder induk baru** di akun tujuan bila arsip baru ingin dipisah (mis. `PRIMA`),
   salin **ID**-nya dari URL (`…/folders/<ID>`), bukan tautannya. Boleh juga tetap memakai
   folder lama yang sudah dibagikan.
4. **Ambil refresh token** akun tujuan dengan scope `drive` lewat OAuth client di project
   Google Cloud yang SAMA dengan sebelumnya bila masih bisa diakses.
5. **Ganti tiga nilai** di `.env.local` server: `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`. Rahasia tidak pernah masuk
   repo. Restart aplikasi.
6. **Isi folder** (`drive_root` atau `drive_folder_*`) di Admin Panel → Drive & Backup.
7. **Klik UJI SEKARANG.** Semua tujuan harus `ok`, **termasuk "baca berkas lama"** (§8.2
   langkah 5). `lama_tak_terbaca` → langkah 2 atau scope di langkah 4 belum benar;
   `permission` → folder tujuan belum dibagikan; `token` → refresh token salah/dicabut;
   `quota` → akun penuh.
8. **Jalankan backup manual**: `node scripts/backup-db.js` → `drive_health` "baru saja" dan
   satu baris baru di `drive_arsip`.
9. **Buka satu lampiran lama** dari layar Usulan/BBA dan **unduh satu Word LKJIP bergambar**
   — bukti dari sisi pemakai, bukan hanya dari tombol Uji.
10. **Akun lama JANGAN dihapus.** Berkas lama tetap miliknya (kecuali kepemilikannya
    dialihkan); menghapus akunnya = menghapus lampiran, bukti, dan gambar yang ID-nya
    masih dirujuk PRIMA. Akun lama dipertahankan selama berkas itu masih dibutuhkan
    (praktisnya: selama data tahun-tahun itu masih diaudit).

Rollback: kembalikan tiga env + folder ID lama, restart. Karena berkas tidak disentuh,
rollback tidak kehilangan data.

### 11.2 Selama akun masih dipegang satu orang (kondisi hari ini)

Yang dipegang perorangan bukan folder-nya, melainkan **refresh token**-nya: token itu
melekat pada akun Google orang yang membuatnya. Selama orang itu masih di kantor,
semuanya jalan tanpa keluhan — dan justru karena itu risikonya tidak terasa sampai hari
serah terima.

Yang **tidak** berubah saat pindah SERVER (akun tetap): folder, berkas, dan aksesnya —
alamatnya ditentukan ID, bukan mesin. Yang berubah saat pindah AKUN dijelaskan §11.0:
berkas lama tetap ada, tapi aplikasi hanya bisa membacanya kalau langkah 2 & 4 benar.

Yang **ikut mati** kalau akunnya hilang tanpa serah terima: unggahan berikutnya
(`invalid_grant`, semua modul berhenti bersamaan) **dan** pembacaan semua berkas lama
— lampiran usulan, bukti BBA, gambar Word LKJIP — karena pemiliknya ikut hilang.

Karena itu tiga hal ini lebih penting daripada kerapian konfigurasi:

1. **Akun milik institusi, bukan milik orang.** Alamatnya berpola jabatan (mis.
   `prima.backup@…`), pemulihan (email sekunder + nomor telepon) di bawah kendali IT,
   dan kata sandinya di tempat yang bisa dibuka atasan langsung — bukan hanya di ponsel
   satu orang. Makin cepat ini dikerjakan, makin sedikit berkas yang harus dibagikan
   ulang saat pindah (§11.0).
2. **Serah terima = 3 nilai + berbagi folder + Uji hijau.** Ini alasan §5 memisahkan
   rahasia (env) dari alamat (database): yang berpindah tangan hanya rahasianya — tetapi
   akses ke berkas lama harus ikut dibagikan, kalau tidak Uji langkah 5 merah.
3. **Catat siapa pemegangnya.** Tabel "Pemegang akun Drive & tempat kredensial" di
   `docs/BACKUP-RESTORE.md` (akun, pemegang, pemulihan, letak kredensial, tanggal
   verifikasi terakhir). `BACKUP-RESTORE.md` §"Kalau akunnya berganti" menyebut
   langkah backup saja — ikut dibetulkan di Tahap 1 (lampiran & bukti juga terdampak).

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
| Refresh token dicabut (`invalid_grant`) | backup & unggahan berhenti tanpa suara; gejalanya baru terasa saat butuh restore | `drive_health` + banner (§10, sadar jam nyala server); tombol Uji memetakan `invalid_grant` → `kode: 'token'` |
| Pindah akun tanpa berbagi folder lama | semua lampiran, bukti BBA, dan gambar Word LKJIP lama 404 sekaligus — berkasnya ada, aplikasinya tidak bisa membaca | §11.0; Uji langkah "baca berkas lama" (§8.2) wajib hijau sebelum akun lama dilepas |
| Akun lama dihapus sesudah pindah | berkas yang masih dirujuk ID-nya ikut hilang permanen | §11.1 langkah 10 |
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
- `lkjip` di `folderUnggahan` ikut `_LKJIP` dengan cadangan folder umum (A14); arsip versi
  lewat `folderUntuk('lkjip_arsip')` tanpa cadangan (perilaku hari ini).
- `jenisGalatDrive()` di samping `kodeGalatDrive()` (arti lama tidak diubah).
- `docs/PANDUAN-pemasangan-windows.md` dilengkapi `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON`
  dan catatan `BACKUP_ENC_PASSWORD`; `docs/BACKUP-RESTORE.md` §"Kalau akunnya berganti"
  diganti rujukan ke §11 di sini (lampiran & bukti ikut terdampak, bukan hanya backup).
- **DoD**: `eslint` 0 warning, `tsc` hijau, `test-bba-referensi.mts` (C17) lulus,
  uji statis baru "tidak ada `process.env.GOOGLE_DRIVE_FOLDER_ID` di luar
  `drive-tujuan.ts` & skrip" lulus, unggah & unduh satu berkas nyata berhasil, gambar
  LKJIP baru mendarat di folder `_LKJIP` dan gambar lama tetap tampil di Word.

### Tahap 2 — Uji & manifest

- Migrasi `drive_arsip`, `drive_health` (+ entri `docs/schema-mysql.sql`).
- `POST /api/admin/drive/uji` termasuk langkah "baca berkas lama" (§8.2 no. 5), penulisan
  `drive_health` dari kelima jalur unggah (upload, impor & versi LKJIP, cadangan BLUD, backup).
- Nama berkas backup memakai jam WIB (A16).
- Skrip backup menulis manifest + `drive_health`; rotasi berbasis manifest; kunci anti-tumpang-tindih.
- **DoD**: migrasi dijalankan di DB uji; Uji hijau untuk 3 tujuan dan gagal-terbaca
  untuk folder yang sengaja dikosongkan; backup manual menghasilkan 1 baris manifest;
  rotasi tidak menyentuh berkas di luar manifest; audit `DRIVE_UJI` tercatat; "baca
  berkas lama" merah bila ID berkas tercatat diganti ID karangan (uji DB) dan hijau untuk
  berkas nyata.

### Tahap 3 — Layar & subfolder otomatis

- `TabDriveBackup.tsx` + route baca `GET /api/admin/drive/status`.
- `pastikanFolder()` + `drive_root` + audit `DRIVE_FOLDER_UBAH`.
- **DoD**: panel menampilkan kuota, 6 tujuan, 10 arsip terbaru; banner mengikuti
  `backupBasi` (§10) — diuji murni: Senin pagi sesudah akhir pekan mati = tanpa warna,
  server hidup 2 jam tanpa backup hari ini = merah, restart siang = tanpa warna; mode `drive_root` membuat subfolder sekali dan memakai ID
  itu pada unggahan berikutnya (dibuktikan dengan dua kali unggah: tidak ada folder
  kedua).

Perkiraan: ± 1 hari per tahap. Tahap 1 tidak bergantung pada persetujuan skema; Tahap
2–3 menunggu §15.

## 15. Keputusan yang perlu persetujuan pemilik sebelum Tahap 2

1. **Akun Drive**: akun pribadi ber-refresh-token (cukup; kuota 15 GB; token bisa
   dicabut) atau **Shared Drive** Workspace + service account (kuota organisasi, tidak
   mati saat staf keluar; butuh Workspace).
2. **Scope token** — *saran direvisi*: `drive` penuh untuk **akun khusus PRIMA**. Dengan
   `drive.file`, berkas lama tidak terbaca begitu akun atau project OAuth berganti (§11.0),
   dan folder buatan manusia tak terlihat (§7.3). `drive.file` hanya aman kalau akun &
   project dijamin tidak pernah berganti — sesuatu yang §11.2 justru bilang pasti terjadi.
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
| `GOOGLE_DRIVE_FOLDER_ID` | lampiran usulan, gambar editor & impor Word LKJIP (A14), cadangan BBA | ya, bila memakai unggahan |
| `GOOGLE_DRIVE_FOLDER_ID_LKJIP` | arsip docx Simpan Versi saja (impor & gambar LKJIP tidak membacanya — A14) | tidak; setelah Tahap 1 juga menampung gambar & impor LKJIP |
| `GOOGLE_DRIVE_FOLDER_ID_BBA` | `/api/upload` untuk `buku_besar_aset` | tidak (fallback) |
| `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON` | `lib/blud/cadangan-json.ts` | tidak (panel menampilkan "belum dikonfigurasi") |
| `GOOGLE_DRIVE_FOLDER_ID_BACKUP` | `scripts/backup-db.js` | ya, untuk backup |
| `BACKUP_ENC_PASSWORD` | `scripts/backup-db.js`, `backup-decrypt.js` | ya (min 16 char) |
| `BACKUP_RETENTION` | `scripts/backup-db.js` | tidak (default 30) |
| `MYSQLDUMP_PATH` | `scripts/backup-db.js` | tidak (default `mysqldump` di PATH) |

Status pemeriksaan sebelum Tahap 1:

| # | Hal | Status | Pengaruhnya |
|---|---|---|---|
| 1 | Scope token yang beredar sekarang | **belum** — melekat pada token, tak terbaca dari repo | menentukan apakah §7.2 langkah 3 (cari-atau-buat subfolder) bisa diandalkan |
| 2 | Baris `file_url` lama bertautan `drive.google.com` | **selesai di dev**, produksi belum — 0 dari 6 baris (§16.1) | A8 tidak berdampak di data yang diperiksa; kueri §16.1 tinggal dijalankan di produksi |
| 3 | `GOOGLE_DRIVE_FOLDER_ID_BACKUP` & `_BLUD_JSON` terisi di produksi | **belum** | menentukan apakah Tahap 2 langsung berguna atau perlu setup akun dulu |
| 4 | Pemegang akun Drive & letak kredensial tercatat | **belum** — formulirnya sudah disediakan di `docs/BACKUP-RESTORE.md` §"Pemegang akun Drive & tempat kredensial" | tanpa catatan ini, serah terima bergantung pada ingatan satu orang (§11.1) |

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

Arti hasilnya, dipakai apa adanya — jangan dua bahasa untuk satu angka:

- **0** → A8 **tidak berdampak sama sekali**. Tidak ada lampiran yang menuntut izin
  akses, tidak ada data yang perlu dibersihkan, dan label "Lihat di Google Drive" tidak
  pernah muncul. Merapikan labelnya boleh, tapi itu kosmetik, bukan perbaikan temuan.
- **>0** → ada lampiran yang hanya bisa dibuka pemilik akun Drive. Dua pilihan, dan
  keduanya keputusan data (bukan pekerjaan Tahap 1): dibiarkan karena berkasnya memang
  ada di akun itu, atau diunggah ulang lewat `/api/upload` supaya pindah ke proxy.

Angka 0 pada tabel di atas berlaku untuk `prima_db_3`. Kalau produksi memberi angka lain,
yang berubah adalah **kesimpulan A8**, bukan isi §16.1 — perbarui baris A8 di §2.1 dan
baris 2 pada tabel status di atas pada saat yang sama, supaya dokumen ini tidak memuat
dua versi kenyataan.

### 16.2 Tempat ID berkas Drive disimpan (14 November 2026)

Dasar §11.0 dan langkah "baca berkas lama" (§8.2 no. 5). Semuanya dibaca lewat token
aplikasi yang sedang terpasang; tidak satu pun menyimpan salinan berkasnya.

| # | Tempat | Isi | Dibaca oleh |
|---|---|---|---|
| 1 | `uploaded_files.file_id` | induk semua unggahan `/api/upload` (+ `context` modul) | `/api/upload/download` (otorisasi) |
| 2 | `usulan_items.file_url` | URL proxy `/api/upload/download?id=…` | layar Usulan |
| 3 | `bba_lampiran.file_id` | bukti dukung BBA | modal item BBA |
| 4 | `bba_referensi_harga.file_id` | tangkapan layar/nota referensi | modal item BBA |
| 5 | `bba_eksisting.file_id` | foto pendataan (tabel dipensiunkan, data lama) | — |
| 6 | `bba_aset_riwayat.file_id` | foto riwayat aset | kartu aset |
| 7 | `lkjip_block.payload` (GAMBAR `fileId`, GRAFIK `imageFileId`) — ikut tersalin di foto `lkjip_versi` | gambar & grafik LKJIP | editor + `docgen.ts` (Word) |
| 8 | `lkjip_versi.drive_file_id` | arsip docx Simpan Versi | daftar riwayat LKJIP |
| 9 | `blud_riwayat_simpan.drive_file_id` | cadangan JSON BLUD | panel cadangan BLUD |

Backup database tidak tercatat di tabel mana pun hari ini (A5) — `drive_arsip` Tahap 2
menjadi tempat ke-10.

## 17. Revisi 14 November 2026 — koreksi & pengembangan

Konsep dicocokkan ulang dengan kode sebelum dikerjakan. Yang dibetulkan di tempatnya:

| # | Bagian | Versi pertama | Kenyataan / perbaikan |
|---|---|---|---|
| K1 | §11, §11.2 | pindah akun: "berkas lama tidak ikut berubah", serah terima "3 nilai + 1 klik" | berkas lama **tidak terbaca** token akun baru (A15) → bagikan folder lama + scope `drive`, jangan salin, jangan hapus akun lama |
| K2 | §15 no. 2 | scope pilihan bebas | saran `drive` penuh untuk akun khusus — satu-satunya jalan berkas lama tetap terbuka |
| K3 | §6.1 | `kodeGalatDrive` memulangkan jenis bertulisan | ia memulangkan kode HTTP dan dipakai pembanding `404`; jenis = fungsi baru `jenisGalatDrive` |
| K4 | §6.1 | `uploadBufferToDrive` → `{ id, … }` | namanya `fileId` (3 pemanggil) — dipertahankan, cukup ditambah `size` |
| K5 | §1, A2 | "enam pembaca folder" | empat tempat; impor Word LKJIP lewat `folderUnggahan` |
| K6 | A14, §6.2 | LKJIP satu tujuan berfolder `_LKJIP` | gambar & impor LKJIP hari ini ke folder umum; dipisah `lkjip` / `lkjip_arsip` |
| K7 | §5.4 | retensi "permanen" & "sedang", event `DRIVE_BACKUP_JALAN` | hanya PANJANG (5 th) & PENDEK (12 bl); event dibuang (tombolnya tidak diusulkan) |
| K8 | §8.1 | `isSameOriginRequest` wajib | fungsi itu tidak ada; pola route admin yang ada + cookie `SameSite=Lax` |
| K9 | §10 | banner "> 36 jam" | alarm palsu tiap Senin karena server tidak menyala 24 jam (A17) → `backupBasi` |
| K10 | §16 | `_LKJIP` dipakai "versi & impor" | hanya arsip versi |

Yang dikembangkan:

1. **Uji "baca berkas lama"** (§8.2 no. 5) — tombol Uji versi pertama hanya membuktikan
   akun bisa MENULIS berkas baru; kegagalan terbesar (A15) justru di berkas lama. Murah:
   satu `files.get` metadata per tujuan, ID diambil dari tempat-tempat §16.2.
2. **Banner sadar jam nyala server** (§10) — fungsi murni, bisa diuji tanpa Drive.
3. **Peta tempat ID berkas** (§16.2) — dasar uji di atas, sekaligus daftar yang wajib
   ditinjau bila suatu hari ada migrasi ID berkas.
4. **Nama berkas backup ber-jam WIB** (A16, §9.1).
5. **Prosedur pindah akun yang bisa diverifikasi pemakai** (§11.1 langkah 9: buka satu
   lampiran lama + unduh satu Word LKJIP bergambar), bukan hanya tombol Uji.

Belum terverifikasi dan sengaja tidak ditebak: apakah OAuth client BARU di project Google
Cloud yang SAMA tetap bisa membaca berkas `drive.file` buatan client lama (§11.0 baris
kedua). Uji langkah 5 yang menjawabnya saat terjadi; sampai itu, anggap berisiko.

## 18. Pelaksanaan Tahap 1 + folder induk (14 November 2026)

Atas permintaan pemilik, **folder induk & subfolder otomatis** (§7, semula Tahap 3)
dimajukan ke Tahap 1. Layar Admin Panel tetap Tahap 3.

| Hal | Rancangan §5–§7 | Yang dipasang | Kenapa |
|---|---|---|---|
| Tempat ID folder induk | `app_config.drive_root` lewat Admin Panel | env `GOOGLE_DRIVE_FOLDER_ID_ROOT` | panelnya belum ada; tanpa panel, `app_config` hanya bisa diisi lewat SQL. Tahap 3 menambah `app_config` di depan env |
| Catatan subfolder | 5 kunci `drive_folder_*` | SATU kunci `drive_subfolder_otomatis` = JSON `{ induk, folder: { backup_db, lkjip, blud_json, bba, usulan } }` | catatan terikat pada induknya: induk diganti → catatan lama diabaikan dan subfolder baru dibuat di induk baru. Lima kunci lepas akan tetap menunjuk subfolder induk lama |
| Kunci saat membuat | — | `blud_locks` `drive_folder:otomatis` (aplikasi DAN skrip backup) + baca ulang di bawah kunci | dua pemanggil bersamaan tidak membuat folder kembar; sekali per tujuan, jadi kunci yang menunggu Google tidak mengganggu |
| Audit `DRIVE_FOLDER_UBAH` | ditulis saat subfolder dibuat | belum; dicatat di log (`[drive] subfolder … dibuat`) + catatan `app_config` | pembuatan terjadi di dalam unggahan/skrip tanpa `req`; audit ikut panel Tahap 3 |
| Nama subfolder | `01-backup-db` … | `01 Backup Database`, `02 LKJIP`, `03 Cadangan BLUD`, `04 Buku Besar Aset`, `05 Lampiran Usulan` | terbaca orang yang membuka Drive; satu daftar `NAMA_SUBFOLDER`, skrip backup dicocokkan uji |

Aturan yang berlaku (`lib/services/drive-tujuan.ts`):

1. Folder induk terisi → SEMUA tujuan ke subfolder-nya, **mengalahkan** env per tujuan
   (tujuan pemilik: semua berkas PRIMA di satu tempat). Arsip versi LKJIP dan cadangan
   BLUD yang dulu "belum dikonfigurasi" ikut menyala.
2. Subfolder gagal disiapkan (induk salah, token dicabut) → **melempar**, tidak jatuh
   diam-diam ke env lama. Skrip backup tetap membuat dump dan menaruhnya di
   `backups-pending/` (folder gagal = sama dengan unggahan gagal).
3. Folder induk kosong → perilaku lama per env, kecuali satu perubahan disengaja (A14):
   gambar editor & impor Word LKJIP ke `_LKJIP` dengan cadangan folder umum.
4. Berkas lama TIDAK dipindah; dibaca lewat ID, jadi tetap terbuka.

**Dibuktikan di Drive sungguhan** (folder induk pemilik, token `drive.file`): kelima
subfolder dibuat di folder induk buatan tangan; pencarian nama MENEMUKAN subfolder buatan
aplikasi (tanpa catatan `app_config`, jadi server lain dengan OAuth client yang sama tidak
membuat kembaran); unggah ke subfolder berhasil; skrip backup membuat "01 Backup
Database", mengunggah dump terenkripsi, dan aplikasi membaca subfolder yang sama dari
`app_config`. Semua subfolder & berkas uji dihapus sesudahnya.

**Temuan saat diuji**: subfolder MEWARISI akses "siapa pun yang punya tautan" dari folder
induk (dibaca dari `permissions` subfolder). Folder induk wajib diatur **Restricted** —
kalau tidak, lampiran, bukti BBA, dan cadangan JSON BLUD (tidak terenkripsi) terbuka bagi
siapa pun yang memegang tautan induk. Aplikasi tidak bisa memeriksanya sendiri: token
`drive.file` tidak bisa membaca folder induk buatan tangan.

Regresi: `npx tsx --env-file=.env.local scripts/test-drive-terpusat.mts` (46; bagian D
MySQL + Drive tiruan; bagian E Drive sungguhan bila `UJI_DRIVE_INDUK` diisi, +4,
`UJI_DRIVE_HAPUS=1` membuang subfolder buatan uji). 10 uji mutasi: 9 tertangkap, 1 setara
(antrean dalam proses dibuang — kunci basis data sudah menjamin satu folder; antrean hanya
menghemat koneksi).

## 19. Pelaksanaan Tahap 2–3 (14 November 2026)

Migrasi: `docs/migrations/migration-drive-arsip.sql` (`drive_arsip` + `drive_health`,
§5.2–§5.3 apa adanya). **Aman dijalankan sebelum atau sesudah kodenya dipasang**: tanpa
tabel, pencatatan gagal diam-diam, panel menampilkan spanduk "migrasi belum dijalankan",
dan rotasi backup jatuh ke cara lama.

### 19.1 Keputusan §15 yang diisi tanpa mengubah perilaku

| § 15 | Dipakai | Alasan |
|---|---|---|
| 1 Akun | akun pribadi ber-refresh-token (seperti sekarang) | Shared Drive butuh Workspace; tidak ada kode yang terkunci pada pilihan ini |
| 2 Scope | tidak diubah (melekat pada token, bukan kode) | mengganti scope = membuat token baru — tindakan pemilik akun. Uji "baca berkas lama" yang memberi tahu kapan ini jadi masalah |
| 3 Mode folder | folder induk (dipilih pemilik, §18) | — |
| 4 Retensi | tetap 30 **berkas** terbaru | perilaku hari ini; jadwal sekali sehari = 30 hari |
| 5 Salinan kedua lampiran | **dikerjakan** — laptop server + Drive yang sama (§20); akun Google kedua menyusul | keputusan pemilik |
| 6 Panel | satu tab "Drive & Backup" (grup Sistem, Super Admin) | — |

### 19.2 Yang dipasang

| Bagian | Berkas | Catatan |
|---|---|---|
| Satu pintu unggah | `lib/services/drive-catatan.ts` `unggahKeTujuan()` | folder → unggah → `drive_arsip` (sha256 isi yang diunggah) → `drive_health`. Dipakai `/api/upload`, impor & arsip versi LKJIP, cadangan BLUD. `uploadBufferToDrive` langsung hanya boleh di `drive*.ts` (uji B7b). Folder belum diatur ≠ gagal sambungan: tidak dicatat |
| Uji | `lib/services/drive-uji.ts` `ujiDrive()` | per tujuan: tulis → baca → hapus berkas 16 byte (sekali per FOLDER), lalu **baca berkas lama** tertua & terbaru (§16.2) → `lama_tak_terbaca`. Kuota lewat `about.get`. Hasil ke `drive_health` + `app_config.drive_uji_terakhir` (JSON, menggantikan `drive_last_test_at`) |
| Status | `bacaStatusDrive()` | HANYA membaca DB — membuka panel tidak memanggil Google dan tidak membuat folder (uji B20) |
| Peringatan backup | `lib/services/drive-status.ts` `backupBasi()` (murni) | §10 disesuaikan dengan jadwal 12.00 (`docs/PANDUAN-jadwal-backup.md`): **kuning** = belum ada backup hari ini padahal sudah lewat 14.00 dan aplikasi hidup ≥ 2 jam; **merah** = terakhir berhasil > 4 hari; **belum** = belum pernah tercatat. Dua tingkat, bukan satu: "hari ini telat" dan "sudah berhari-hari mati" butuh tanggapan berbeda |
| Route | `app/api/admin/drive/route.ts` | SUPER_ADMIN; GET status; POST `uji` (1/30 detik, audit `DRIVE_UJI` S) & `atur_induk` (audit `DRIVE_FOLDER_UBAH` P, nilai lama → baru) |
| Folder induk dari panel | `app_config.drive_root` | mengalahkan env `GOOGLE_DRIVE_FOLDER_ID_ROOT` (aplikasi DAN skrip backup); kosongkan = kembali ke env. Panel menerima URL folder yang ditempel apa adanya (`bacaIdFolder`), yang disimpan tetap ID |
| Panel | `app/(dashboard)/admin/_panels/TabDriveBackup.tsx` | folder induk, Uji + kuota, kesehatan per tujuan (tautan ke folder), 10 backup terakhir + sha256 |
| Skrip backup | `scripts/backup-db.js` | nama berkas jam WIB (A16) · `drive_arsip` + `drive_health` · rotasi dari manifest, baris diberi `dihapus_pada` (A6) · kunci `backups-pending/.lock` (basi sesudah 2 jam) · galat fatal dilempar supaya sempat dicatat · spawn mysqldump gagal tidak lagi `process.exit` di dalam event |

Per-tujuan `drive_folder_*` di panel (§10 baris "Isian folder") **tidak** dibuat: mode
folder induk sudah dipilih, dan lima isian yang tak pernah dipakai hanya menambah cara
salah mengisi. Kalau suatu hari dibutuhkan, `folderUntuk` tempatnya.

### 19.3 Dibuktikan

- Drive sungguhan: Uji keenam tujuan hijau, kuota terbaca; ID karangan di manifest
  backup → `lama_tak_terbaca` (tujuan lain tetap hijau).
- Skrip backup dijalankan 4× dengan retensi 3: nama `…-15-50` (WIB), berkas ke-4 memicu
  rotasi tepat satu berkas, barisnya `dihapus_pada` terisi; jalan kelima dengan `.lock`
  terpasang → `[LEWAT]`, exit 0. mysqldump salah path → `[FATAL]` + tercatat, tidak menggantung.
- Panel di peramban (akun dummy, sementara Super Admin): status, UJI SEKARANG, tempel URL
  folder → tersimpan sebagai ID "DARI PANEL", kosongkan → kembali ke env, 375 px tanpa
  meluap, tema terang; peran ADMIN → 403.
- Regresi: `scripts/test-drive-terpusat.mts` (85 tanpa internet; +6 bagian E Drive
  sungguhan), 17 uji mutasi tertangkap. Dua awalnya LOLOS: batas "hidup sejak 00.00"
  ternyata mubazir (syarat lewat jadwal + 2 jam sudah menjaminnya — kodenya disederhanakan),
  dan pemeriksaan berkas lama hanya tertangkap uji Drive sungguhan (kini juga D16 dengan
  Drive tiruan).

## 20. Salinan kedua lampiran (14 November 2026)

Menjawab §15 no. 5 / A11. Backup database hanya memuat **ID** berkas; lampiran usulan,
bukti & referensi BBA, gambar & impor Word LKJIP, dan arsip Word LKJIP hanya tinggal di
Drive. Keputusan pemilik: **dua salinan sekarang** — di laptop server DAN di Drive yang
sama; akun Google kedua nanti.

| Salinan | Di mana | Menolong saat | Tidak menolong saat |
|---|---|---|---|
| Lokal | `BACKUP_LAMPIRAN_DIR` (bawaan `<folder aplikasi>\backups-lampiran`, di-gitignore), `<modul>\<fileId>__<nama>` | akun Google hilang/diretas/dicabut | laptop rusak/dicuri |
| Drive | subfolder **06 Salinan Lampiran** (`files.copy`, tanpa unduh) atau `GOOGLE_DRIVE_FOLDER_ID_SALINAN` | berkas/folder asli terhapus atau dibereskan orang (melampaui 30 hari Sampah) | akun Google hilang |

Bersama keduanya, lampiran hanya hilang bila akun Google **dan** laptop hilang bersamaan.

**Dijalankan `scripts/backup-db.js`, SESUDAH backup database** — satu tugas terjadwal,
satu kunci `.lock`. Aturannya:

- Daftar = `uploaded_files` (semua modul pengunggah) + `lkjip_versi.drive_file_id`, tertua
  dulu. **Cadangan JSON BLUD tidak ikut**: isinya salinan baris `blud_riwayat_simpan.isi`,
  sudah ada di backup database.
- **Bertahap**: lokal — berkas yang namanya sudah berawalan `<fileId>__` dilewati (sumber
  kebenarannya isi folder, jadi salinan yang terhapus diunduh ulang); Drive — yang sudah
  tercatat di `drive_arsip` (`tujuan='salinan_lampiran'`, kolom baru **`asal_file_id`**).
  Tanpa manifest (migrasi belum dijalankan) salinan Drive **dilewati**, sebab tanpa catatan
  tiap jalan akan menyalin ulang semuanya.
- Unduhan ditulis ke `.part` lalu diganti nama — berkas setengah jadi tidak dianggap salinan.
- Dibatasi 40 menit per jalan (tugas terjadwal dibatasi 1 jam); sisanya "tertunda" dan
  dilanjutkan besok. Jalan pertama di server bisa makan beberapa hari bila lampirannya banyak.
- Berkas yang sudah tidak ada di Drive (404) dihitung **hilang**, bukan gagal.
- Kegagalan salinan **tidak** mengubah kode keluar skrip: berkas yang memang sudah dihapus
  pemiliknya akan "gagal" selamanya dan membuat tugas tampak rusak padahal backup
  database-nya sehat. Jejaknya di log (`[SALINAN]`), `drive_health` (`salinan_lampiran`),
  dan ringkasan `app_config.salinan_lampiran_ringkas` → panel Drive & Backup.
- Berkas lokal **tidak terenkripsi** (beda dengan dump database): foldernya jangan dibagikan.

Tujuan baru `salinan_lampiran` ikut tombol Uji (probe + baca salinan lama) dan tabel
kesehatan. Migrasi `migration-drive-arsip.sql` diperluas (`asal_file_id` + indeks) — belum
pernah dijalankan di server, jadi tetap satu berkas.

Dibuktikan di dev (folder induk sungguhan): jalan pertama +2 lokal & +2 Drive, jalan kedua
+0/+0, salinan lokal yang dihapus diunduh ulang (+1), isi 745 byte = asli; panel menampilkan
"LENGKAP" keduanya. Regresi `test-drive-terpusat.mts` 95, 8 uji mutasi tertangkap.
