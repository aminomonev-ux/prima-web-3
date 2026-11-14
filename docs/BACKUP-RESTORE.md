# PRIMA — Backup & Restore Database

Lapis 1 strategi backup PRIMA: dump harian MySQL → gzip → enkripsi AES-256-GCM
→ upload ke folder Google Drive privat → hapus file lokal → rotasi otomatis.
Script: `scripts/backup-db.js` (backup) + `scripts/backup-decrypt.js` (restore).

## Alur

```
mysqldump prima_db
   → gzip
   → enkripsi AES-256-GCM (BACKUP_ENC_PASSWORD)
   → upload Drive: subfolder "01 Backup Database" di GOOGLE_DRIVE_FOLDER_ID_ROOT
     (dibuat sendiri bila belum ada), atau GOOGLE_DRIVE_FOLDER_ID_BACKUP bila tanpa folder induk
   → hapus lokal (sukses) / simpan backups-pending/ (gagal, retry run berikutnya)
   → rotasi: hapus file tertua di Drive melebihi BACKUP_RETENTION (default 30)
   → log: scripts/backup-db.log
```

- Nama file: `prima-db-YYYY-MM-DD-HH-mm.sql.gz.enc`
- Password mysqldump lewat env `MYSQL_PWD` (tidak tampil di process list).
- **Fail-closed**: tanpa `BACKUP_ENC_PASSWORD` (min 16 char) backup tidak dibuat —
  dump polos tidak boleh naik ke cloud.

## Setup (sekali)

1. `.env.local` di server harus punya (selain `MYSQL_*` dan `GOOGLE_OAUTH_*` yang sudah ada):
   ```
   GOOGLE_DRIVE_FOLDER_ID_ROOT="<id folder induk PRIMA>"   # atau _BACKUP="<id folder backup>"
   BACKUP_ENC_PASSWORD="<acak min 16 char>"
   ```
   Dengan folder induk, skrip membaca/menulis `app_config` (kunci
   `drive_subfolder_otomatis`) lewat `MYSQL_*` yang sama, jadi aplikasi dan skrip
   memakai subfolder yang SAMA. Rotasi hanya di folder yang sedang dipakai: backup lama di
   folder sebelumnya tidak ikut dibersihkan — hapus manual sesudah pindah.
2. ⚠️ **Salin `BACKUP_ENC_PASSWORD` ke tempat aman DI LUAR server** (password
   manager / catatan fisik terkunci). Kalau server mati total dan password ikut
   hilang, seluruh backup di Drive tidak bisa dibuka.
3. Pastikan `mysqldump` bisa dipanggil. Kalau tidak ada di PATH, set
   `MYSQLDUMP_PATH` ke path lengkap `mysqldump.exe` (contoh di `.env.example`).
4. Tes manual: `node scripts/backup-db.js` → cek file muncul di folder Drive
   dan `scripts/backup-db.log` berisi `UPLOAD-OK`.

## Pemegang akun Drive & tempat kredensial

Backup ini memakai **OAuth2 refresh token** milik satu akun Google (bukan service
account). Token melekat pada akun pembuatnya, jadi yang menentukan backup tetap jalan
bukan folder-nya, melainkan akun itu: kalau akunnya hilang atau aksesnya dicabut,
unggahan **berikutnya** berhenti (di log muncul `RETRY-FAIL`, galatnya `invalid_grant`),
sementara arsip yang sudah naik tetap utuh dan tautannya tidak berubah.

Isi tabel ini saat setup dan tinjau setiap pergantian pejabat. **Catat lokasinya, jangan
nilainya** — password, client secret, dan refresh token tidak boleh ditulis di berkas
ini, di repo, atau di tiket.

| Hal | Isi |
|---|---|
| Akun Google pemilik backup | … (pola jabatan, mis. `prima.backup@…` — bukan akun pribadi staf) |
| Pemegang akun (nama & jabatan) | … |
| Pemulihan akun (email sekunder, no. HP) | … — di bawah kendali IT, bukan ponsel satu orang |
| Letak `GOOGLE_OAUTH_*` | … (mis. `.env.local` server + salinan di password manager) |
| Letak `BACKUP_ENC_PASSWORD` | … (wajib di luar server, lihat Setup poin 2) |
| Verifikasi terakhir | … (tanggal + hasil `UPLOAD-OK`) |

Aturan serah terima:

1. Kalau **akunnya berganti**: ikuti `docs/CONCEPT-drive-terpusat.md` §11.1 — bukan hanya
   backup yang terdampak. Lampiran usulan, bukti BBA, dan gambar Word LKJIP lama dibaca
   lewat token yang terpasang; token akun baru TIDAK bisa membacanya kecuali folder lama
   dibagikan ke akun baru dan token ber-scope `drive` penuh. Jangan menyalin berkas (ID
   baru = rujukan putus), dan jangan menghapus akun lama.
2. Kalau **akunnya sama, servernya berganti**: cukup tiga nilai `GOOGLE_OAUTH_*` di
   server baru. Folder ID tidak berubah, jadi tautan dan arsip lama tetap berlaku.
3. Kalau **pemegangnya pensiun/pindah**: pastikan poin 1 atau 2 sudah dikerjakan
   **sebelum** akunnya dinonaktifkan. Sesudah akun mati, arsip lama masih bisa dibuka
   pemilik baru hanya jika aksesnya dibagikan lebih dulu — bukan otomatis.

Rincian konsep dan tombol Uji yang diusulkan: `docs/CONCEPT-drive-terpusat.md` §11
(prosedur pindah akun) dan §11.1 (akun yang masih dipegang perorangan).

## Penjadwalan (Windows Task Scheduler, tiap malam)

Buat Basic Task (jalankan sebagai user yang sama dengan PM2, "Run whether user
is logged on or not"):

- **Program**: `node`
- **Arguments**: `scripts\backup-db.js`
- **Start in**: folder project (mis. `C:\apps\prima-web`)
- **Trigger**: Daily 01.00

Linux/crontab: `0 1 * * * cd /opt/prima-web && node scripts/backup-db.js`

## Restore

1. Unduh file `.sql.gz.enc` dari folder Drive backup.
2. Dekripsi (butuh `BACKUP_ENC_PASSWORD` — dari `.env.local` atau env var):
   ```
   node scripts/backup-decrypt.js prima-db-2026-07-02-01-00.sql.gz.enc
   ```
   Menghasilkan `prima-db-2026-07-02-01-00.sql`.
3. Import ke MySQL (dump memuat `CREATE DATABASE`, jadi bisa ke server kosong):
   ```
   mysql --user=root --password < prima-db-2026-07-02-01-00.sql
   ```
   Atau lewat HeidiSQL: File → Load SQL file → jalankan.
4. Hapus file `.sql` hasil dekripsi setelah selesai (berisi data sensitif polos).

⚠️ Restore MENIMPA seluruh isi `prima_db` dengan kondisi saat backup dibuat.
Data setelah jam backup hilang — kecuali binlog aktif (Lapis 2 di bawah).

## Uji restore berkala (wajib, minimal tiap 6 bulan)

Backup yang tidak pernah dites restore = belum tentu backup. Ambil file backup
terbaru, restore ke MySQL laptop dev (database sementara), cek beberapa tabel
berisi data wajar, lalu drop database uji tersebut.

## Lapis 2 — Point-in-time recovery (opsional, direkomendasikan)

Aktifkan binary log MySQL supaya bisa "mundur ke menit tertentu" di antara dua
backup harian. Di `my.ini`/`my.cnf` section `[mysqld]`:

```ini
log-bin = mysql-bin
binlog_expire_logs_seconds = 604800   # simpan 7 hari
```

Restart MySQL. Recovery ke titik waktu: restore dump semalam, lalu replay
binlog sampai sebelum kejadian:

```
mysqlbinlog --stop-datetime="2026-07-02 10:22:00" mysql-bin.000123 | mysql -u root -p
```

## Troubleshooting

| Gejala di log | Penyebab umum | Solusi |
|---|---|---|
| `FATAL mysqldump exit 1` | path/kredensial salah | cek `MYSQLDUMP_PATH` + `MYSQL_*` |
| `UPLOAD-FAIL` | internet mati / token OAuth kadaluarsa | file aman di `backups-pending/`, auto-retry run berikutnya |
| `RETRY-FAIL` berulang / `invalid_grant` | refresh token dicabut, akun dinonaktifkan, atau sandinya diganti | generate ulang `GOOGLE_OAUTH_REFRESH_TOKEN` (OAuth Playground) — lihat §"Pemegang akun Drive & tempat kredensial" |
| Dekripsi gagal saat restore | password salah / file korup | pakai salinan `BACKUP_ENC_PASSWORD` yang benar; coba file backup lain |
