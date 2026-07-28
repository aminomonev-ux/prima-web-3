# Panduan Pemasangan PRIMA — Windows Server

> Untuk server IT kantor RSJD Dr. Amino Gondohutomo.
> Sasaran: dari server kosong sampai aplikasi jalan dan bisa diandalkan.
>
> Baca dulu **§0** sebelum mengerjakan apa pun. Satu paragraf di sana menghemat
> puluhan langkah yang tidak perlu Anda lakukan.

---

## §0 Satu hal yang harus diluruskan lebih dulu

Di `docs/migrations/` ada **78 berkas**. Anda **tidak perlu menjalankan satu pun**
untuk pemasangan baru.

`docs/schema-mysql.sql` adalah skema **lengkap dan terkini** — sudah mencakup
seluruh isi 78 migration itu, termasuk yang paling baru. Migration hanya dipakai
untuk **memutakhirkan database yang sudah berisi data**.

| Keadaan | Yang dijalankan |
|---|---|
| Server kantor, database baru & kosong | **`schema-mysql.sql` saja**, sekali |
| Database sudah berisi data, mau naik versi | migration yang belum pernah masuk, berurutan |

Ini penting karena keliru di sini adalah risiko terbesar pemasangan: menjalankan
migration satu per satu di database baru akan gagal di tengah dengan cara yang
membingungkan (kolom sudah ada, tabel belum ada, urutan tidak jelas karena 50 dari
78 berkas namanya tidak bernomor).

**Untuk pemasangan baru: lupakan folder migration.**

---

## §1 Yang perlu dipasang di server

| Perangkat | Versi | Catatan |
|---|---|---|
| **Node.js** | **20.x LTS** | Jangan 22/24. CI proyek ini memakai Node 20 + npm 10.8.2; versi lain bisa menghasilkan `package-lock.json` yang tidak cocok (pelajaran L57). |
| **MySQL** | **8.0.13+** (ideal 8.4) | Skema memakai `DEFAULT (expr)` yang baru ada sejak 8.0.13. |
| **PM2** | terbaru | `npm install -g pm2 pm2-windows-startup` |
| **Nginx for Windows** | terbaru stabil | Sebagai reverse proxy + HTTPS. |
| Redis | — | **Lewati.** Lihat §7. |

Pastikan npm-nya benar sebelum apa pun:

```bash
node -v
npm -v
```

Kalau npm bukan 10.8.2, samakan dulu — ini bukan kerewelan, `npm ci` bisa gagal
dengan pesan yang tidak menjelaskan apa-apa:

```bash
npm install -g npm@10.8.2
```

---

## §2 Database

Buat database dan user khusus aplikasi. **Jangan pakai `root` untuk aplikasi** —
kalau kredensialnya bocor, yang bocor seluruh server MySQL, bukan satu database.

```sql
CREATE DATABASE prima_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'prima'@'localhost' IDENTIFIED BY 'ISI_SANDI_KUAT_DI_SINI';
GRANT ALL PRIVILEGES ON prima_db.* TO 'prima'@'localhost';
FLUSH PRIVILEGES;
```

Lalu jalankan skemanya — lewat MySQL Workbench / HeidiSQL (buka berkasnya, Execute),
atau baris perintah:

```bash
mysql -u prima -p prima_db < docs\schema-mysql.sql
```

Skema ini sudah membuat akun **`superadmin`** dengan sandi bawaan `Admin@Prima2025`.
**Ganti sandinya begitu bisa login.** Sandi ini tertulis di berkas skema yang ada di
repo publik — siapa pun bisa membacanya.

### Periksa dua setelan MySQL yang gampang terlewat

Kode ini mengandalkan keduanya. Kalau berbeda, sebagian query berperilaku lain —
dan bedanya halus, bukan error yang jelas kelihatan.

```sql
SELECT @@sql_mode;          -- harus memuat ONLY_FULL_GROUP_BY
SELECT @@global.time_zone;  -- catat nilainya
SHOW VARIABLES LIKE 'event_scheduler';  -- untuk §5
```

`ONLY_FULL_GROUP_BY` adalah bawaan MySQL 8, jadi biasanya sudah benar. Kalau
ternyata dimatikan di server ini, nyalakan lagi di `my.ini` — jangan sebaliknya
menyesuaikan kode.

---

## §3 Berkas aplikasi & env

Salin repo ke server, misalnya `C:\apps\prima`. Lalu:

```bash
cd C:\apps\prima
npm ci
```

Buat `C:\apps\prima\.env.local`. **Berkas ini tidak boleh masuk git** dan tidak
boleh dibagikan lewat WhatsApp/email.

```ini
# ── Database ──────────────────────────────────────────────
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=prima
MYSQL_PASSWORD=<sandi dari §2>
MYSQL_DATABASE=prima_db
MYSQL_SSL=false

# ── Kunci rahasia — WAJIB, aplikasi berhenti kalau kosong ──
JWT_SECRET=<acak, minimal 32 karakter>
CRON_SECRET=<acak, minimal 32 karakter>
PROMOTION_SECRET=<acak, minimal 32 karakter>
PROMOTION_RECOVERY_SECRET=<acak, minimal 32 karakter>
PROMOTION_OWNER_EMAILS=admin@rsjdamino.go.id

# ── Alamat aplikasi — SALAH DI SINI TIDAK MENIMBULKAN ERROR ──
# Dipakai untuk tautan di email verifikasi & reset sandi. Kalau keliru,
# emailnya tetap terkirim tapi tautannya mengarah ke tempat yang salah.
NEXT_PUBLIC_APP_URL=https://prima.rsjdamino.go.id

NODE_ENV=production

# ── Google Drive (arsip LKJIP & backup) — opsional ──────────
# Kalau dikosongkan, fitur arsip gagal DIAM-DIAM (best-effort, tidak error).
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_FOLDER_ID_LKJIP=
GOOGLE_DRIVE_FOLDER_ID_BACKUP=

# ── Backup ────────────────────────────────────────────────
BACKUP_ENC_PASSWORD=<acak>
MYSQLDUMP_PATH=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe
```

Membuat kunci acak di PowerShell:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Jalankan empat kali, satu untuk tiap kunci. **Jangan memakai kunci yang sama untuk
keempatnya**, dan jangan memakai kunci yang pernah dipakai di laptop pengembangan.

Lalu bangun:

```bash
npm run build
```

Kalau `npm run build` gagal karena `JWT_SECRET`, itu **bukan bug** — memang
disengaja begitu supaya aplikasi tidak pernah jalan dengan kunci kosong.

---

## §4 PM2

```bash
pm2 start npm --name prima -- start
pm2 save
pm2-startup install
```

`pm2-startup install` yang membuat PM2 hidup lagi otomatis setelah server
di-restart. Tanpa ini, aplikasi mati diam-diam setiap kali Windows Update
me-reboot server — dan tidak ada yang memberi tahu.

**Tetap di mode `fork` (satu proses).** Jangan pakai `-i max` / cluster. Alasannya
di §7; ringkasnya: beberapa pembatas laju menghitung per-proses, jadi cluster
justru melonggarkannya tanpa Anda sadari.

Perintah harian:

```bash
pm2 status
pm2 logs prima --lines 100
pm2 restart prima
```

---

## §5 Tugas terjadwal — bagian yang paling sering terlupa

Ada **tiga** tugas yang harus dijalankan berkala. Kalau tidak dipasang, aplikasi
tetap menyala dan tampak normal — yang terjadi: permintaan promosi peran
menggantung selamanya, dan data kedaluwarsa tidak pernah dibersihkan. **Tidak ada
pesan error apa pun.**

| Endpoint | Guna | Saran jadwal |
|---|---|---|
| `/api/cron/promotion-complete` | Menuntaskan promosi peran yang sudah waktunya | tiap 15 menit |
| `/api/cron/promotion-expire` | Membatalkan permintaan promosi yang kedaluwarsa | tiap jam |
| `/api/cron/purge-retention` | Menghapus data lewat masa simpan (UU PDP) | harian, dini hari |

Ketiganya dijaga `CRON_SECRET` lewat header `Authorization: Bearer <CRON_SECRET>`.

Di Windows Server, pakai **Task Scheduler**. Buat satu berkas
`C:\apps\prima\cron.ps1`:

```powershell
param([Parameter(Mandatory=$true)][string]$Endpoint)

# Sengaja membaca .env.local, bukan menyalin rahasianya ke berkas ini —
# supaya sandi cuma hidup di satu tempat.
$secret = (Get-Content 'C:\apps\prima\.env.local' |
           Where-Object { $_ -match '^CRON_SECRET=' }) -replace '^CRON_SECRET=', ''
$secret = $secret.Trim()

try {
  Invoke-RestMethod -Method Post `
    -Uri "http://localhost:3000/api/cron/$Endpoint" `
    -Headers @{ Authorization = "Bearer $secret" } `
    -TimeoutSec 120 | Out-Null
  "$(Get-Date -f s) OK $Endpoint" |
    Add-Content 'C:\apps\prima\logs\cron.log'
} catch {
  "$(Get-Date -f s) GAGAL $Endpoint - $($_.Exception.Message)" |
    Add-Content 'C:\apps\prima\logs\cron.log'
}
```

Buat foldernya dulu: `mkdir C:\apps\prima\logs`

Lalu tiga tugas di Task Scheduler (jalankan sebagai akun layanan, centang **Run
whether user is logged on or not**):

```
powershell.exe -ExecutionPolicy Bypass -File C:\apps\prima\cron.ps1 -Endpoint promotion-complete
powershell.exe -ExecutionPolicy Bypass -File C:\apps\prima\cron.ps1 -Endpoint promotion-expire
powershell.exe -ExecutionPolicy Bypass -File C:\apps\prima\cron.ps1 -Endpoint purge-retention
```

**Uji sekali dengan tangan sebelum percaya:**

```powershell
powershell -ExecutionPolicy Bypass -File C:\apps\prima\cron.ps1 -Endpoint promotion-expire
Get-Content C:\apps\prima\logs\cron.log -Tail 5
```

Kalau tertulis `GAGAL ... 401`, berarti `CRON_SECRET` yang terbaca skrip tidak sama
dengan yang dipakai aplikasi — biasanya karena ada spasi atau tanda kutip di
`.env.local`.

Alternatif MySQL EVENT tidak dipakai di sini karena tugas-tugas ini memanggil
endpoint HTTP, bukan mengubah tabel langsung.

---

## §6 Nginx & HTTPS

Aplikasi mendengarkan di `localhost:3000`. Nginx yang menghadap ke jaringan.

```nginx
server {
    listen 443 ssl;
    server_name prima.rsjdamino.go.id;

    ssl_certificate     C:/nginx/ssl/prima.crt;
    ssl_certificate_key C:/nginx/ssl/prima.key;

    client_max_body_size 25M;   # unggahan berkas usulan & impor Excel

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        'upgrade';
    }
}

server {
    listen 80;
    server_name prima.rsjdamino.go.id;
    return 301 https://$host$request_uri;
}
```

Dua baris yang **wajib** ada dan sering dilupakan:

- **`X-Real-IP`** — dipakai untuk mengenali IP pengguna. Tanpa ini, semua pemakai
  terlihat berasal dari satu IP yang sama, dan pembatas laju per-IP jadi salah
  sasaran: satu orang yang salah sandi berulang kali bisa memblokir seluruh kantor.
- **`X-Forwarded-Proto`** — tanpa ini aplikasi mengira dirinya berjalan di HTTP,
  dan cookie sesi bisa gagal dipasang.

Buka port 443 di Windows Firewall, dan **jangan** buka port 3000 ke jaringan —
biarkan hanya Nginx yang bisa menghubunginya.

---

## §7 Redis — sengaja dilewati

Aplikasi mendukung tiga backend pembatas laju dan memilih sendiri saat start:
Upstash (cloud), Redis lokal, atau — kalau keduanya kosong — penghitung di dalam
memori proses.

**Untuk sekarang, biarkan kosong.** Alasannya bukan malas:

Dua pengaman terpenting **tidak memakai Redis sama sekali**. Kunci akun setelah 5
kali salah sandi disimpan di MySQL (`users.failed_attempts`, `locked_until`), dan
kuota email dihitung realtime dari tabel `email_log`. Keduanya selamat dari restart
dan dari mode cluster.

Yang memakai Redis hanyalah rem tambahan — throttle per-IP dan batas simpan
per-menit. Tanpa Redis, remnya tetap ada, cuma hitungannya kembali nol setiap PM2
restart. Untuk aplikasi internal dengan pemakai terbatas, itu dapat diterima.

**Kapan perlu dipasang:** kalau suatu saat PM2 dijalankan mode cluster, atau
aplikasi dibuka dari luar jaringan kantor. Di Windows, Redis resmi tidak ada —
pakai **Memurai** atau Docker. Lalu cukup satu baris di `.env.local`:

```ini
REDIS_URL=redis://localhost:6379
```

Restart PM2. **Tidak ada kode yang perlu diubah.**

Sesekali intip apakah remnya diam-diam turun ke mode memori:

```bash
pm2 logs prima --lines 500 | findstr DEGRADED
```

Kalau muncul padahal `REDIS_URL` sudah diisi, Redis-nya mati. Aplikasi tetap jalan
normal — tidak ada gejala yang kelihatan dari layar. Justru itu yang membuatnya
perlu dicek sesekali.

---

## §8 Daftar periksa setelah pemasangan

Kerjakan berurutan. Berhenti di langkah pertama yang gagal — jangan lanjut.

- [ ] `pm2 status` → `prima` berstatus **online**
- [ ] Buka `https://<domain>` → halaman login muncul, gembok HTTPS hijau
- [ ] Login `superadmin` / `Admin@Prima2025` → **langsung ganti sandinya**
- [ ] Buat satu akun uji, lalu salah sandi 5× → **akun terkunci 15 menit**
      (ini membuktikan pengaman login bekerja)
- [ ] Buka `/menu` → kartu aplikasi muncul sesuai hak akses
- [ ] Masuk `/blud/dpa` → tabel tampil tanpa error
- [ ] Admin Panel → matikan satu modul → pastikan kartunya jadi abu **dan**
      mengetik URL modul itu langsung dilempar ke halaman "Sedang Dalam Perbaikan".
      Nyalakan lagi.
- [ ] Unduh satu berkas Excel/Word dari modul mana pun → berhasil
- [ ] Jalankan ketiga tugas cron dengan tangan (§5) → `cron.log` berisi `OK`
- [ ] Restart server Windows → PM2 hidup sendiri, aplikasi jalan lagi
- [ ] `pm2 logs prima --lines 200` → tidak ada error berulang

---

## §9 Kalau ada yang tidak beres

| Gejala | Kemungkinan besar |
|---|---|
| `npm ci` gagal `EUSAGE` | npm bukan 10.8.2 (**L57**) |
| Build berhenti menyebut `JWT_SECRET` | `.env.local` belum ada / kunci kosong — **ini disengaja** |
| Login berhasil tapi langsung terlempar keluar | `X-Forwarded-Proto` belum diteruskan Nginx (§6) |
| Semua pemakai terlihat dari IP sama | `X-Real-IP` belum diteruskan Nginx (§6) |
| Tautan di email verifikasi salah alamat | `NEXT_PUBLIC_APP_URL` keliru |
| Promosi peran menggantung, tak ada error | Tugas terjadwal belum dipasang (§5) |
| Arsip LKJIP tidak muncul di Drive | Kredensial Google kosong — gagalnya memang diam |
| Satu modul tiba-tiba 503 | Sakelar maintenance-nya menyala di Admin Panel |
| Query mengeluh soal `GROUP BY` | `ONLY_FULL_GROUP_BY` dimatikan di server (§2) |

---

## §10 Memutakhirkan versi (bukan pemasangan baru)

```bash
cd C:\apps\prima
git pull
npm ci
```

Lalu jalankan **hanya migration yang belum pernah masuk** di database ini. Karena
tidak ada catatan otomatis migration mana yang sudah dijalankan, **catat sendiri**
— buat satu berkas teks di server, tulis nama berkas + tanggal setiap kali
menjalankan satu.

Baru kemudian:

```bash
npm run build
pm2 restart prima
```

**Backup database dulu sebelum menjalankan migration apa pun.** Migration mengubah
struktur tabel dan tidak bisa dibatalkan dengan tombol.

---

## Catatan jujur tentang panduan ini

Panduan ini disusun dari membaca kode, **bukan dari pemasangan yang sudah pernah
berhasil di server kantor**. Perintah dan berkas konfigurasinya benar menurut isi
proyek ini, tapi tiap server punya kejutannya sendiri — jalur MySQL, kebijakan
firewall, sertifikat, hak akses folder.

Perlakukan §8 sebagai bagian yang wajib, bukan pelengkap. Di situlah asumsi
panduan ini diuji terhadap kenyataan server Anda.
