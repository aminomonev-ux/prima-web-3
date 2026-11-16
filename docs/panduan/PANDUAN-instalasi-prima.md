# Panduan Instalasi PRIMA — dari server kosong sampai backup harian

> Satu panduan untuk seluruh pemasangan PRIMA di Windows: perangkat lunak, database,
> aplikasi, hidup otomatis, tugas terjadwal, Google Drive, backup, restore, dan
> memutakhirkan versi. Menggantikan tiga panduan lama (`PANDUAN-pemasangan-windows.md`,
> `PANDUAN-jadwal-backup.md`, `BACKUP-RESTORE.md`) yang isinya sudah mulai saling
> bertentangan.
>
> Disusun dari pemasangan sungguhan di server PRIMA (laptop kantor yang dimatikan tiap
> malam) — termasuk semua yang sempat salah di sana. Perintah yang menyebut folder
> memakai contoh `D:\APLIKASI\prima-web-3`; **ganti dengan folder Anda sendiri.**
> Nama komputer & akun Windows ditulis `<KOMPUTER>\<akun>`.

---

## §0 Sebelum mulai — pilih jalurnya

| Keadaan | Bagian yang dikerjakan |
|---|---|
| **Server baru**, database kosong | §1 → §16 berurutan, lalu §17 daftar periksa |
| **Server sudah jalan**, mau naik versi | langsung §18 |
| Ada yang tidak beres | §19 |
| Pengelola PRIMA berganti / akun Google berganti | §20 |

Satu hal yang paling sering keliru, jadi diluruskan di depan: **pemasangan baru TIDAK
menjalankan satu pun berkas di `docs/migrations/`.** `docs/schema-mysql.sql` sudah memuat
seluruh isi migrasi sampai yang terbaru. Migrasi hanya untuk database yang **sudah berisi
data** dan mau dinaikkan versinya (§18). Menjalankan migrasi satu per satu di database
baru gagal di tengah dengan cara yang membingungkan.

### Peta komponen

```
                  ┌──────────────────────── laptop/server PRIMA ────────────────────────┐
 pemakai LAN ───► │  Node.js + PM2 ──► Next.js (port 3000) ──► MySQL (Laragon, 3306)     │
 (browser)        │        ▲                                          ▲                  │
                  │        │ menghidupkan                             │ mysqldump        │
                  │  Task Scheduler: hidupkan aplikasi · 5 tugas cron · backup harian    │
                  └───────────────────────────────┬──────────────────────────────────────┘
                                                  │ OAuth (refresh token)
                                                  ▼
                                   Google Drive — folder induk PRIMA
                                   01 Backup Database · 02 LKJIP · 03 Cadangan BLUD
                                   04 Buku Besar Aset · 05 Lampiran Usulan · 06 Salinan Lampiran
```

---

# BAGIAN A — PERSIAPAN

## §1 Perangkat lunak yang dipasang

| Perangkat | Versi | Catatan |
|---|---|---|
| **Node.js** | **22.x LTS** (minimal 22.23.4) | Pasang lewat installer resmi nodejs.org untuk **semua pengguna** (bukan nvm per akun) — tugas terjadwal yang berjalan sebagai `SYSTEM` tidak melihat Node milik satu akun |
| **npm** | **10.8.2** persis | Sama dengan CI. npm lain bisa menulis `package-lock.json` yang membuat `npm ci` gagal `EUSAGE` |
| **Git for Windows** | terbaru | untuk mengambil & memperbarui kode |
| **Laragon** (berisi MySQL) | MySQL **8.0.13+**, ideal **8.4** | skema memakai `DEFAULT (expr)` yang baru ada sejak 8.0.13. MySQL Server biasa juga boleh |
| **PM2** | terbaru | `npm install -g pm2` — **tanpa** `pm2-windows-startup` (§8) |
| HeidiSQL | bawaan Laragon | untuk menjalankan berkas SQL |
| **LibreOffice** | terbaru (dipakai: 26.8.3) | mengubah Word → PDF di server untuk tombol PDF Perjanjian Kinerja. Tanpa ini aplikasi tetap jalan, tapi PDF PK ditolak dan pratinjau Riwayat PK jadi "perkiraan tampilan". Cara memasang di §1.1 |
| Nginx for Windows | opsional | hanya kalau memakai HTTPS (§11) |
| Redis | — | **dilewati**, alasannya di §11.3 |

Periksa sesudah memasang Node:

```powershell
node -v
npm -v
(Get-Command node).Source
```

Catat hasil baris ketiga (biasanya `C:\Program Files\nodejs\node.exe`) — dipakai di §14.
Kalau npm bukan 10.8.2:

```powershell
npm install -g npm@10.8.2
```

Installer Node membawa npm-nya sendiri, jadi periksa lagi `npm -v` setiap kali Node
dinaikkan versinya.

### 1.1 LibreOffice (PDF Perjanjian Kinerja)

Tombol **Unduh PDF** dan pratinjau di Riwayat PK membuat PDF dari berkas Word yang sama
lewat LibreOffice, jadi letak baris di PDF persis sama dengan Word. Pasang dari PowerShell
**Administrator**:

```powershell
winget install --id TheDocumentFoundation.LibreOffice --source winget
```

Lalu pastikan terpasang di lokasi yang dicari aplikasi:

```powershell
Test-Path 'C:\Program Files\LibreOffice\program\soffice.com'
(Get-Item 'C:\Program Files\LibreOffice\program\soffice.exe').VersionInfo.ProductVersion
```

Baris pertama harus `True`. Kalau LibreOffice terpasang di tempat lain (mis. hanya untuk
satu akun di `AppData`), isi `LIBREOFFICE_PATH` di `.env.local` (§6) dengan path lengkap
`soffice.com`. Pakai **`soffice.com`, bukan `soffice.exe`**: `soffice.com` versi konsol
yang menunggu sampai PDF selesai, dan itu yang dipakai aplikasi di lokasi bawaan.

Hal yang perlu diketahui:

- **Tidak perlu build atau restart.** Aplikasi mencari LibreOffice setiap kali PDF diminta,
  jadi begitu terpasang tombol PDF langsung bekerja.
- PDF dibuat **satu per satu** (antrean). Unduh massal PDF banyak dokumen memang lebih lama
  daripada unduh Word, dan dibatasi jumlahnya sekali unduh.
- Aplikasi memakai profil LibreOffice sendiri di folder sementara, jadi LibreOffice yang
  sedang dibuka orang di laptop server tidak mengganggu dan tidak terganggu.
- Huruf di PDF memakai huruf yang terpasang di Windows. Kalau suatu saat templat Word PK
  memakai huruf yang tidak ada di server, LibreOffice menggantinya dan baris bisa bergeser.
- Pembaruan LibreOffice boleh kapan saja (`winget upgrade --id TheDocumentFoundation.LibreOffice`);
  sesudahnya ulangi pemeriksaan `Test-Path` di atas.

## §2 Akun & rahasia yang disiapkan

Siapkan semua ini **sebelum** mulai, dan catat **di mana** masing-masing disimpan —
bukan nilainya. Nilai rahasia tidak boleh ditulis di repo, tiket, grup WhatsApp, atau
tangkapan layar (sandi yang sempat tampil di gambar dianggap bocor dan harus diganti).

| Yang disiapkan | Dipakai di | Simpan salinannya di |
|---|---|---|
| Sandi user MySQL aplikasi | `.env.local` (§6) | pengelola sandi / amplop tertutup |
| `JWT_SECRET`, `CRON_SECRET`, `PROMOTION_SECRET`, `PROMOTION_RECOVERY_SECRET` | `.env.local` | cukup di server; buat ulang kalau hilang |
| **Akun Google khusus PRIMA** (bukan akun pribadi staf) + 2FA | Google Drive (§12) | sandi & pemulihan dipegang IT, bukan satu orang |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` | `.env.local` | pengelola sandi |
| **`BACKUP_ENC_PASSWORD`** | backup (§13) | **WAJIB di luar server** — hilang = semua backup di Drive tidak bisa dibuka siapa pun |
| Sandi `superadmin` | login pertama (§7) | diganti lewat Profil sesudah login pertama |

Tabel pemegang (isi saat pemasangan, tinjau tiap pergantian pejabat — §20):

| Hal | Isi |
|---|---|
| Akun Google pemilik Drive PRIMA | … (berpola jabatan, mis. `prima.backup@…`) |
| Pemegang akun (nama & jabatan) | … |
| Pemulihan akun (email sekunder, nomor HP) | … — di bawah kendali IT |
| Letak `GOOGLE_OAUTH_*` | … (mis. `.env.local` server + pengelola sandi) |
| Letak `BACKUP_ENC_PASSWORD` | … (di luar server) |
| Verifikasi terakhir | … (tanggal + hasil Uji Drive & `UPLOAD-OK`) |

---

# BAGIAN B — DATABASE

## §3 Setelan MySQL

Nyalakan Laragon → **Start All**. Lalu di HeidiSQL (atau `mysql`):

```sql
SELECT @@sql_mode;                       -- harus memuat ONLY_FULL_GROUP_BY, STRICT_TRANS_TABLES, NO_ZERO_DATE
SELECT @@global.time_zone;               -- catat nilainya
SHOW VARIABLES LIKE 'event_scheduler';
```

Ketiganya bawaan MySQL 8, jadi biasanya sudah benar. Kalau dimatikan di server ini,
nyalakan lagi di `my.ini` — jangan sebaliknya menyesuaikan kode. `STRICT_TRANS_TABLES` +
`NO_ZERO_DATE` membuat tanggal karangan (mis. `2026-13-45`) ditolak database, bukan
disimpan diam-diam sebagai `0000-00-00`. `ONLY_FULL_GROUP_BY` dimatikan = sebagian kueri
rekap memulangkan angka lain tanpa galat.

Supaya MySQL hidup tiap laptop menyala: Laragon → Preferences → centang **Run Laragon when
Windows starts** dan **Start All automatically**. Backup (§14) gagal kalau MySQL mati di
jam backup.

## §4 Database, user, dan skema

Buat database dan user khusus aplikasi. **Jangan pakai `root` untuk aplikasi** — kalau
kredensialnya bocor, yang bocor seluruh server MySQL.

```sql
CREATE DATABASE prima_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'prima'@'localhost' IDENTIFIED BY 'ISI_SANDI_KUAT_DI_SINI';
GRANT ALL PRIVILEGES ON prima_db.* TO 'prima'@'localhost';
FLUSH PRIVILEGES;
```

Skemanya diambil sesudah kode ada di server (§5), lalu dijalankan sekali:

- HeidiSQL: pilih database `prima_db` → **File → Load SQL file** →
  `D:\APLIKASI\prima-web-3\docs\schema-mysql.sql` → **Execute** (F9); atau
- baris perintah:
  ```powershell
  mysql -u prima -p prima_db < D:\APLIKASI\prima-web-3\docs\schema-mysql.sql
  ```

Skema membuat akun **`superadmin`** **tanpa sandi yang diketahui siapa pun** — sandinya
disetel di §7.

Periksa hasilnya (membaca saja):

```powershell
cd D:\APLIKASI\prima-web-3
node scripts/check-schema.mjs
node scripts/cek-tahap-0.mjs
```

`check-schema` harus berbunyi **SINKRON**. `cek-tahap-0` baris **PUTUSAN** harus `OK`,
tanpa sakelar bertanda `!!`. Keduanya butuh `.env.local` (§6) — kerjakan sesudah §6 kalau
belum ada.

---

# BAGIAN C — APLIKASI

## §5 Mengambil kode

```powershell
mkdir D:\APLIKASI
cd D:\APLIKASI
git clone https://github.com/aminomonev-ux/prima-web-3.git
cd prima-web-3
npm ci
```

`npm ci` (bukan `npm install`) memasang **persis** versi di `package-lock.json`. Kalau ia
gagal `EUSAGE`, npm-nya bukan 10.8.2 (§1).

Jangan menaruh berkas buatan sendiri (konfigurasi PM2, skrip, catatan) **di dalam** folder
repo — berkas tak terlacak bisa membuat `git pull` berikutnya menolak jalan. Taruh di
`D:\APLIKASI\` (satu tingkat di atas).

## §6 Berkas `.env.local`

Salin `.env.example` menjadi `.env.local` di folder aplikasi, lalu isi. **Berkas ini tidak
pernah masuk git** dan tidak boleh dikirim lewat WhatsApp/email.

> ⚠️ Isi `.env.local` diketik/ditempel **di berkas itu** (Notepad), bukan dijalankan di
> HeidiSQL. Baris seperti `GOOGLE_DRIVE_FOLDER_ID_ROOT="…"` di jendela Query hanya
> menghasilkan galat SQL 1064 dan tidak berpengaruh apa pun.

### 6.1 Isi lengkap

| Variabel | Wajib? | Isi & catatan |
|---|---|---|
| `MYSQL_HOST` / `MYSQL_PORT` | ya | `localhost` / `3306` |
| `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | ya | dari §4 |
| `MYSQL_SSL` | ya | `false` untuk MySQL lokal |
| `JWT_SECRET` | ya | acak ≥ 32 karakter. Kosong/pendek = aplikasi **sengaja** menolak jalan |
| `CRON_SECRET` | ya | acak ≥ 32 karakter, dipakai tugas terjadwal (§9) |
| `PROMOTION_SECRET` | ya | frasa 12–16 karakter yang diketik saat menaikkan peran |
| `PROMOTION_RECOVERY_SECRET` | ya | acak 32 karakter hex, untuk darurat semua SUPER_ADMIN terkunci |
| `PROMOTION_OWNER_EMAILS` | ya | maksimal 3 email pemilik, dipisah koma |
| `NEXT_PUBLIC_APP_URL` | ya | **persis** alamat yang diketik pemakai, termasuk `http://`/`https://` dan port. Salah = tidak ada galat, tapi tautan di email mengarah ke tempat lain |
| `NODE_ENV` | ya | `production` |
| `COOKIE_SECURE` | **ya bila HTTP** | `false` kalau diakses lewat `http://` (LAN tanpa HTTPS). Tanpa ini login "berhasil" lalu terlempar balik ke halaman login, tanpa pesan. Hapus kalau sudah HTTPS |
| `TRUST_PROXY_HEADERS` | ya | `false`; `true` HANYA kalau Nginx berdiri di depan DAN port 3000 tertutup dari jaringan (§11.2) |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | untuk Drive | §12. Kosong = semua fitur arsip gagal **diam-diam** |
| `GOOGLE_DRIVE_FOLDER_ID_ROOT` | untuk Drive | ID folder induk (§12.4). Mengalahkan semua `GOOGLE_DRIVE_FOLDER_ID_*` lain |
| `GOOGLE_DRIVE_FOLDER_ID`, `_LKJIP`, `_BBA`, `_BLUD_JSON`, `_BACKUP`, `_SALINAN` | tidak | hanya kalau TANPA folder induk — satu folder per tujuan |
| `BACKUP_ENC_PASSWORD` | untuk backup | acak ≥ 16 karakter. Tanpa ini backup **tidak dibuat** (dump polos tidak boleh naik ke cloud). Salinannya WAJIB di luar server |
| `MYSQLDUMP_PATH` | sangat disarankan | path lengkap `mysqldump.exe` (§13.1) |
| `BACKUP_RETENTION` | tidak | jumlah **berkas** backup yang disimpan di Drive, bawaan `30` |
| `BACKUP_LAMPIRAN_DIR` | disarankan | folder salinan lampiran di laptop, mis. `D:/backup-prima/lampiran`. Kosong = `<folder aplikasi>\backups-lampiran` |
| `LIBREOFFICE_PATH` | tidak | kosongkan kalau LibreOffice terpasang di `C:\Program Files\LibreOffice` (§1.1). Diisi path lengkap `soffice.com` hanya kalau terpasang di tempat lain |
| `REDIS_URL` | **jangan diisi** | §11.3 |

Garis miring biasa (`D:/…`) dan terbalik (`D:\…`) sama-sama boleh untuk path Windows.

### 6.2 Membuat nilai acak

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Jalankan sekali untuk **tiap** kunci — jangan memakai satu nilai untuk beberapa kunci,
dan jangan memakai kunci yang pernah dipakai di laptop pengembang.

## §7 Build & sandi superadmin

```powershell
cd D:\APLIKASI\prima-web-3
npm run build
node scripts/setel-sandi-superadmin.mjs
```

- `npm run build` berhenti menyebut `JWT_SECRET` = `.env.local` belum benar. **Disengaja**:
  aplikasi tidak pernah boleh jalan dengan kunci kosong.
- Skrip sandi mencetak sandi acak **sekali**. Catat langsung di tempat aman — **jangan
  dipotret/diteruskan**. Sesudah login pertama, ganti lewat **Profil** dengan sandi sendiri.
- Skrip yang sama dipakai kalau sandi superadmin lupa atau bocor: semua sesinya
  dikeluarkan, kunci gagal-login dilepas, dan peristiwanya tercatat di audit.

## §8 PM2 & menghidupkan otomatis

### 8.1 Menjalankan aplikasi lewat PM2

**Jangan lewat `npm`.** Di Windows `npm` adalah pembungkus `.cmd`; PM2 sering kehilangan
jejak proses anaknya — `pm2 stop` menutup pembungkusnya sementara Next tetap memegang port
3000. Tunjuk berkas Next langsung. **`-H 0.0.0.0` wajib**, kalau tidak aplikasi hanya bisa
dibuka dari server itu sendiri.

`D:\APLIKASI\prima.config.js` (di LUAR folder repo):

```js
module.exports = {
  apps: [{
    name: 'prima',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -H 0.0.0.0 -p 3000',
    cwd: 'D:\\APLIKASI\\prima-web-3',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    exp_backoff_restart_delay: 2000,
    max_memory_restart: '1G',
    env: { NODE_ENV: 'production' },
    out_file: 'D:\\APLIKASI\\logs\\prima-out.log',
    error_file: 'D:\\APLIKASI\\logs\\prima-err.log',
    merge_logs: true,
    time: true,
  }],
};
```

```powershell
mkdir D:\APLIKASI\logs
pm2 start D:\APLIKASI\prima.config.js
pm2 save
```

**`pm2 save` wajib** — ia menulis daftar proses ke `C:\Users\<akun>\.pm2\dump.pm2`; tanpa
itu tidak ada yang bisa dihidupkan kembali sesudah restart.

**Tetap mode `fork` (satu proses).** Jangan `-i max`/cluster: beberapa rem laju menghitung
per proses, jadi cluster diam-diam melonggarkannya (§11.3).

Buka port 3000 di Windows Firewall kalau pemakai membuka `http://<ip-server>:3000`.

### 8.2 Menghidupkan otomatis — `pulihkan-prima.ps1`

`pm2 startup` hanya ada di Linux, dan `pm2-windows-startup` sudah tidak dipelihara.
Penggantinya satu skrip yang **memeriksa dulu** lalu bertindak, dipicu dari empat arah.
Pemicu "saat login" saja terbukti bolong dua kali di server: sekali tugasnya tidak jalan
sama sekali, sekali aplikasinya hidup lalu tak bisa dihubungi dua jam — keduanya hanya
ketahuan dari log.

Dua syarat yang menentukan:

- **Berjalan sebagai PENGGUNA pemegang PM2, bukan `SYSTEM`.** Data PM2 hidup di
  `C:\Users\<akun>\.pm2`; `SYSTEM` bangun dengan daftar kosong — tugasnya "sukses",
  aplikasinya tetap mati.
- **Menunggu MySQL benar-benar menjawab**, bukan menunggu sekian detik. Saat laptop baru
  menyala MySQL masih bangun; aplikasi yang naik duluan memenuhi log dengan
  `ECONNREFUSED 127.0.0.1:3306`.

`D:\APLIKASI\pulihkan-prima.ps1` (ASCII saja — huruf khusus pernah membuat log jadi
`GöéGöé`):

```powershell
# pulihkan-prima.ps1 - menghidupkan PRIMA saat login, buka kunci, bangun dari sleep, dan tiap 15 menit.
# Kalau aplikasi sudah bisa dihubungi, skrip ini tidak melakukan apa-apa.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$log      = 'D:\APLIKASI\logs\autostart.log'
$terakhir = 'D:\APLIKASI\logs\autostart-terakhir.txt'
$jeda     = 'D:\APLIKASI\JEDA-PULIHKAN.txt'
$pm2      = "$env:APPDATA\npm\pm2.cmd"
$URL      = 'http://localhost:3000/login'

if (-not (Test-Path 'D:\APLIKASI\logs')) {
  New-Item -ItemType Directory -Path 'D:\APLIKASI\logs' -Force | Out-Null
}

function Tulis($pesan) {
  "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') $pesan" | Add-Content -Path $log -Encoding UTF8
}

# Jawaban HTTP apa pun berarti aplikasinya hidup; yang dianggap mati hanya yang tidak bisa tersambung.
function Test-Prima {
  try {
    Invoke-WebRequest -Uri $URL -UseBasicParsing -TimeoutSec 15 | Out-Null
    return $true
  } catch [System.Net.WebException] {
    return ($null -ne $_.Exception.Response)
  } catch {
    return $false
  }
}

function Tunggu-Prima([int]$detik) {
  $batas = (Get-Date).AddSeconds($detik)
  while ((Get-Date) -lt $batas) {
    if (Test-Prima) { return $true }
    Start-Sleep -Seconds 10
  }
  return $false
}

# Menunggu MySQL BENAR-BENAR menjawab di port 3306, bukan menunggu sekian detik.
function Tunggu-MySQL([int]$detikMaks = 300) {
  $batas = (Get-Date).AddSeconds($detikMaks)
  while ((Get-Date) -lt $batas) {
    $sock = $null
    try {
      $sock = New-Object System.Net.Sockets.TcpClient
      $sock.Connect('127.0.0.1', 3306)
      if ($sock.Connected) { return $true }
    } catch {
    } finally {
      if ($sock) { $sock.Close() }
    }
    Start-Sleep -Seconds 5
  }
  return $false
}

function Ada-Prima {
  try {
    $daftar = (& $pm2 jlist 2>$null | Out-String) | ConvertFrom-Json
    return [bool]($daftar | Where-Object { $_.name -eq 'prima' })
  } catch {
    return $false
  }
}

# Dipasang prima-jeda.ps1 saat aplikasi SENGAJA dimatikan. Jeda > 8 jam dianggap terlupa.
if (Test-Path $jeda) {
  if ((Get-Item $jeda).LastWriteTime -lt (Get-Date).AddHours(-8)) {
    Tulis 'JEDA-PULIHKAN.txt lebih dari 8 jam, dianggap terlupa -> dihapus'
    Remove-Item $jeda -Force
  } else {
    "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') DIJEDA" | Set-Content -Path $terakhir
    exit 0
  }
}

# Sehat = tidak menulis log; cukup menimpa satu baris supaya terbukti pemicunya jalan.
if (Test-Prima) { "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') OK" | Set-Content -Path $terakhir; exit 0 }

# MySQL belum siap -> TETAP dilanjutkan, supaya halaman login hidup dan log menyebut kekurangannya.
Tulis 'belum bisa dihubungi, menunggu MySQL siap di port 3306'
if (Tunggu-MySQL 300) {
  Tulis 'MySQL menjawab di 3306'
} else {
  Tulis 'MySQL BELUM menjawab di 3306 sesudah 5 menit -> tetap dilanjutkan'
}
if (Test-Prima) { Tulis 'OK bisa dihubungi sesudah MySQL siap'; exit 0 }

$dengar = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($dengar) { Tulis ('port 3000 didengarkan oleh pid ' + (($dengar | Select-Object -ExpandProperty OwningProcess -Unique) -join ', ')) } else { Tulis 'port 3000 TIDAK didengarkan siapa pun' }
& $pm2 list 2>$null | Out-String | Add-Content -Path $log -Encoding UTF8

if (Ada-Prima) {
  Tulis 'prima ada di PM2 tapi tidak bisa dihubungi -> pm2 restart prima'
  & $pm2 restart prima 2>$null | Out-String | Add-Content -Path $log -Encoding UTF8
} else {
  Tulis 'prima belum ada di PM2 -> pm2 resurrect'
  & $pm2 resurrect 2>$null | Out-String | Add-Content -Path $log -Encoding UTF8
}
if (Tunggu-Prima 300) { Tulis 'OK bisa dihubungi'; exit 0 }

Tulis 'masih tidak bisa dihubungi sesudah 5 menit -> pm2 restart prima sekali lagi'
& $pm2 restart prima 2>$null | Out-String | Add-Content -Path $log -Encoding UTF8
if (Tunggu-Prima 120) { Tulis 'OK bisa dihubungi sesudah restart kedua'; exit 0 }

Tulis 'GAGAL tetap tidak bisa dihubungi. Keadaan PM2:'
& $pm2 list 2>$null | Out-String | Add-Content -Path $log -Encoding UTF8
exit 1
```

Mendaftarkan tugasnya — PowerShell **sebagai Administrator**, ganti `<KOMPUTER>\<akun>`
dengan akun yang memegang PM2 (lihat `whoami`):

```powershell
$akun   = '<KOMPUTER>\<akun>'
$ns     = 'Root/Microsoft/Windows/TaskScheduler'
$login  = New-ScheduledTaskTrigger -AtLogOn -User $akun
$buka   = New-CimInstance -CimClass (Get-CimClass -ClassName MSFT_TaskSessionStateChangeTrigger -Namespace $ns) -ClientOnly
$buka.Enabled = $true; $buka.StateChange = 8; $buka.UserId = $akun
$bangun = New-CimInstance -CimClass (Get-CimClass -ClassName MSFT_TaskEventTrigger -Namespace $ns) -ClientOnly
$bangun.Enabled = $true; $bangun.Subscription = '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name=''Microsoft-Windows-Power-Troubleshooter''] and EventID=1]]</Select></Query></QueryList>'
$ulang  = New-ScheduledTaskTrigger -Daily -At 06:30
$ulang.Repetition = (New-ScheduledTaskTrigger -Once -At 06:30 -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 14)).Repetition
$ulang.Repetition.StopAtDurationEnd = $false
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-ExecutionPolicy Bypass -WindowStyle Hidden -File D:\APLIKASI\pulihkan-prima.ps1'
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
$pri = New-ScheduledTaskPrincipal -UserId $akun -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName 'PRIMA - hidupkan aplikasi' -Action $act -Trigger @($login, $buka, $bangun, $ulang) -Settings $set -Principal $pri -Force
```

| Pemicu | Menutup |
|---|---|
| Saat login | pemakaian normal pagi hari |
| Saat buka kunci (`StateChange = 8`) | laptop dikunci lalu dipakai lagi |
| Bangun dari sleep (Power-Troubleshooter ID 1, termasuk *Fast Startup*) | laptop dibuka tanpa login ulang |
| Tiap 15 menit 06:30–20:30 | **semua yang lain** |

- `StopAtDurationEnd = $false` — bawaannya Windows mematikan paksa tugas yang masih jalan
  saat jendela 14 jam habis, bisa jatuh di tengah restart.
- Batas 20 menit — jalur terburuk skrip mendekati 10 menit.
- `IgnoreNew` — pemicu yang datang saat skrip masih bekerja dilewati, tidak menumpuk.

Tugas ini hanya jalan **selama akun itu login**. Yang dijaga adalah "sudah login tapi
aplikasi mati", bukan "belum ada yang login".

Memeriksa:

```powershell
Get-Content D:\APLIKASI\logs\autostart-terakhir.txt   # jam pemeriksaan terakhir: OK / DIJEDA
Get-Content D:\APLIKASI\logs\autostart.log -Tail 20   # hanya berisi saat skrip BERTINDAK atau GAGAL
```

### 8.3 Mematikan aplikasi dengan sengaja

Karena diperiksa tiap 15 menit, `pm2 stop prima` biasa **akan dinyalakan lagi sendiri** —
di tengah build pun. Pakai dua skrip ini.

`D:\APLIKASI\prima-jeda.ps1`:

```powershell
# prima-jeda.ps1 - matikan PRIMA dengan sengaja (pemeliharaan).
$jeda = 'D:\APLIKASI\JEDA-PULIHKAN.txt'
$log  = 'D:\APLIKASI\logs\autostart.log'
$pm2  = "$env:APPDATA\npm\pm2.cmd"

"dijeda $(Get-Date -f 'yyyy-MM-dd HH:mm:ss') oleh $env:USERNAME" | Set-Content -Path $jeda
"$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') JEDA dipasang -> pm2 stop prima" | Add-Content -Path $log -Encoding UTF8
& $pm2 stop prima

Write-Host ''
Write-Host 'PRIMA dimatikan. Pemulihan otomatis DITAHAN.' -ForegroundColor Yellow
Write-Host 'Sesudah selesai, jalankan: D:\APLIKASI\prima-lanjut.ps1' -ForegroundColor Yellow
Write-Host 'Kalau terlupa, jedanya kedaluwarsa sesudah 8 jam dan aplikasi dinyalakan otomatis.'
```

`D:\APLIKASI\prima-lanjut.ps1`:

```powershell
# prima-lanjut.ps1 - nyalakan kembali PRIMA sesudah prima-jeda.ps1. Jeda SELALU dilepas.
$jeda = 'D:\APLIKASI\JEDA-PULIHKAN.txt'
$log  = 'D:\APLIKASI\logs\autostart.log'
$pm2  = "$env:APPDATA\npm\pm2.cmd"
$URL  = 'http://localhost:3000/login'

function Test-Prima {
  try {
    Invoke-WebRequest -Uri $URL -UseBasicParsing -TimeoutSec 15 | Out-Null
    return $true
  } catch [System.Net.WebException] {
    return ($null -ne $_.Exception.Response)
  } catch {
    return $false
  }
}

& $pm2 restart prima

$hidup = $false
$batas = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $batas) {
  if (Test-Prima) { $hidup = $true; break }
  Start-Sleep -Seconds 5
}

Remove-Item -Path $jeda -Force -ErrorAction SilentlyContinue

Write-Host ''
if ($hidup) {
  "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') JEDA dilepas, aplikasi bisa dihubungi" | Add-Content -Path $log -Encoding UTF8
  Write-Host 'PRIMA hidup lagi dan bisa dibuka. Pemulihan otomatis aktif kembali.' -ForegroundColor Green
} else {
  "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') JEDA dilepas, TAPI aplikasi belum bisa dihubungi sesudah 2 menit" | Add-Content -Path $log -Encoding UTF8
  Write-Host 'Jeda sudah dilepas, TAPI PRIMA belum bisa dibuka sesudah 2 menit.' -ForegroundColor Red
  Write-Host 'Periksa: pm2 logs prima --err --lines 30 --nostream' -ForegroundColor Red
}
```

`prima-lanjut.ps1` memakai `pm2 restart` (bukan `start`): menyalakan proses yang `stopped`,
dan tidak gagal pada proses yang ternyata masih hidup. Pesan PM2 "Use --update-env to
update environment variables" boleh diabaikan — aplikasi membaca `.env.local` sendiri saat
menyala.

Perintah harian:

```powershell
pm2 status
pm2 logs prima --lines 100
```

## §9 Tugas terjadwal aplikasi (cron)

Ada **lima** tugas berkala. Tanpa mereka aplikasi tetap tampak normal — yang terjadi:
promosi peran menggantung, data kedaluwarsa tidak dibersihkan, akses berjangka tidak
dicabut, cadangan BLUD berhenti. **Tanpa satu pesan galat pun.**

| Endpoint | Guna | Jadwal |
|---|---|---|
| `/api/cron/promotion-complete` | menuntaskan promosi peran yang sudah waktunya | tiap 15 menit |
| `/api/cron/promotion-expire` | membatalkan permintaan promosi kedaluwarsa | tiap jam |
| `/api/cron/purge-retention` | menghapus data lewat masa simpan (UU PDP) | harian 08:40 |
| `/api/cron/akses-kedaluwarsa` | mencabut akses berjangka yang habis + pengingat ≤ 3 hari | harian 08:30 |
| `/api/cron/blud-cadangan-json` | mencadangkan foto simpanan BLUD ke Drive | harian 17:00 |

Backup database **bukan** salah satunya — ia skrip Node tersendiri (§14).

Kelimanya dijaga `CRON_SECRET` lewat header `Authorization: Bearer …` — satu mekanisme,
satu skrip pemanggil. `D:\APLIKASI\cron.ps1`:

```powershell
param([Parameter(Mandatory=$true)][string]$Endpoint)

# Membaca .env.local, bukan menyalin rahasianya ke sini - sandi cuma hidup di satu tempat.
$secret = (Get-Content 'D:\APLIKASI\prima-web-3\.env.local' |
           Where-Object { $_ -match '^CRON_SECRET=' }) -replace '^CRON_SECRET=', ''
$secret = $secret.Trim().Trim('"')

try {
  Invoke-RestMethod -Method Post `
    -Uri "http://localhost:3000/api/cron/$Endpoint" `
    -Headers @{ Authorization = "Bearer $secret" } `
    -TimeoutSec 120 | Out-Null
  "$(Get-Date -f s) OK $Endpoint" | Add-Content 'D:\APLIKASI\logs\cron.log'
} catch {
  "$(Get-Date -f s) GAGAL $Endpoint - $($_.Exception.Message)" | Add-Content 'D:\APLIKASI\logs\cron.log'
}
```

### 9.1 Laptop yang dimatikan tiap malam — tiga setelan wajib

Task Scheduler **melewatkan** jadwal yang jatuh saat mesin mati dan **menolak memulai**
tugas saat laptop memakai baterai — keduanya tanpa log, tanpa pesan. Terukur di server:
tugas tiap-15-menit tercatat jalan sekali lalu diam 90 menit, sementara Task Scheduler tetap
melaporkan jadwal berikutnya dengan wajar; yang membongkarnya `cron.log`.

1. **`-StartWhenAvailable`** — jadwal terlewat dijalankan begitu laptop hidup.
2. **Jam kerja** (08:30, 17:00), bukan dini hari.
3. **`-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`**.

Pelajarannya melampaui baterai: **jangan percaya `LastRunTime` sendirian — selalu sediakan
log yang ditulis tugasnya sendiri.**

### 9.2 Mendaftarkan

Periksa dulu tugas yang mungkin sudah ada (nama lain → `-Force` tidak menimpanya, jadi
lahir tugas kembar):

```powershell
Get-ScheduledTask | Where-Object { $_.Actions.Arguments -match 'cron\.ps1' } |
  Select-Object TaskName, @{n='Endpoint';e={($_.Actions.Arguments -split '-Endpoint ')[-1]}}
```

Lalu, PowerShell **sebagai Administrator** (berjalan sebagai `SYSTEM`: tanpa sandi tersimpan,
tidak ikut mati saat orangnya logout):

```powershell
function Pasang-CronPrima {
  param([string]$Nama, [string]$Endpoint, $Pemicu)
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-ExecutionPolicy Bypass -File D:\APLIKASI\cron.ps1 -Endpoint $Endpoint"
  $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $Nama -Action $act -Trigger $Pemicu `
    -Settings $set -User 'SYSTEM' -RunLevel Highest -Force
}

Pasang-CronPrima 'PRIMA - akses kedaluwarsa' 'akses-kedaluwarsa'  (New-ScheduledTaskTrigger -Daily -At 08:30)
Pasang-CronPrima 'PRIMA - purge retention'   'purge-retention'    (New-ScheduledTaskTrigger -Daily -At 08:40)
Pasang-CronPrima 'PRIMA - cadangan BLUD'     'blud-cadangan-json' (New-ScheduledTaskTrigger -Daily -At 17:00)
Pasang-CronPrima 'PRIMA - promotion complete' 'promotion-complete' `
  (New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650))
Pasang-CronPrima 'PRIMA - promotion expire' 'promotion-expire' `
  (New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650))
```

Semua tugas ini tahan terlewat dan aman jalan dua kali (bertanya "mana yang sudah lewat",
bukan "mana yang jatuh hari ini").

Kalau tugas lama sudah terpasang tanpa izin baterai, perbaiki tanpa menimpa setelan lain:

```powershell
Get-ScheduledTask -TaskName 'PRIMA*' | ForEach-Object { $s = $_.Settings; $s.DisallowStartIfOnBatteries = $false; $s.StopIfGoingOnBatteries = $false; Set-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Settings $s | Out-Null; "diperbaiki: $($_.TaskName)" }
```

⚠️ Jangan `Set-ScheduledTask -Settings (New-ScheduledTaskSettingsSet …)` untuk mengubah satu
setelan — itu MENGGANTI seluruh setelan, dan `-StartWhenAvailable` ikut hilang diam-diam.

### 9.3 Membuktikan

```powershell
powershell -ExecutionPolicy Bypass -File D:\APLIKASI\cron.ps1 -Endpoint akses-kedaluwarsa
Get-Content D:\APLIKASI\logs\cron.log -Tail 5
Get-ScheduledTask -TaskName 'PRIMA*' | Get-ScheduledTaskInfo | Select-Object TaskName, LastRunTime, LastTaskResult, NextRunTime
```

`OK` di `cron.log` dan `LastTaskResult` **0** = benar. `GAGAL … 401` = `CRON_SECRET` yang
terbaca skrip berbeda dengan milik aplikasi (spasi atau tanda kutip di `.env.local`).

## §10 Login pertama & sakelar modul

1. Buka `http://<ip-server>:3000` **dari komputer lain**, login `superadmin` dengan sandi §7.
2. **Profil → ganti sandi**.
3. **Admin Panel → Aplikasi → Sakelar**: pastikan modul yang dipakai berstatus hidup.
4. Buat akun untuk pengelola lain, beri peran & akses aplikasi seperlunya — pemberian
   akses modul kolaboratif (BLUD, Kinerja, LKJIP, BBA, Renaksi, IKI) berarti boleh menyunting
   semua datanya, jadi berikan dengan hemat dan tinjau berkala.

## §11 Akses jaringan

### 11.1 LAN polos (HTTP) — yang dipakai sekarang

Pemakai membuka `http://<ip-server>:3000`. Syaratnya `COOKIE_SECURE=false` (§6) dan port
3000 terbuka di Windows Firewall. Yang dilepas dengan tidak memakai HTTPS: sandi & angka
anggaran lewat jaringan **tanpa enkripsi** (siapa pun yang bisa menyadap jaringan kantor
bisa membacanya), dan log audit tidak bisa menunjukkan IP pemakai (semua `unknown`).

### 11.2 HTTPS lewat Nginx — opsional

Aplikasi tetap di `localhost:3000`, Nginx yang menghadap jaringan:

```nginx
server {
    listen 443 ssl;
    server_name prima.kantor.local;

    ssl_certificate     C:/nginx/ssl/prima.crt;
    ssl_certificate_key C:/nginx/ssl/prima.key;

    client_max_body_size 25M;   # unggahan berkas & impor Excel

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
    server_name prima.kantor.local;
    return 301 https://$host$request_uri;
}
```

Sesudah HTTPS berjalan:

- hapus `COOKIE_SECURE=false`, ubah `NEXT_PUBLIC_APP_URL` ke `https://…`;
- `TRUST_PROXY_HEADERS="true"` — **hanya** sesudah port 3000 ditutup dari jaringan. Header
  `X-Real-IP` bisa dikarang siapa pun yang bisa melewati Nginx, dan yang mengarangnya
  menembus semua rem berkunci IP;
- `X-Forwarded-Proto` wajib diteruskan — tanpa itu cookie sesi bisa gagal dipasang;
- buka port 443 di firewall, **tutup** port 3000 dari jaringan.

Kunci akun (5× salah → 15 menit) disimpan per pengguna di MySQL dan tidak pernah menular
ke rekan; yang dipengaruhi IP hanya rem per-IP (antrean beberapa detik).

### 11.3 Redis — sengaja dilewati

Aplikasi memilih sendiri: Upstash, Redis lokal, atau — kalau keduanya kosong — penghitung
di memori proses. **Biarkan kosong.** Dua pengaman terpenting tidak memakai Redis sama
sekali (kunci akun di MySQL, kuota email dari `email_log`); yang memakai Redis hanya rem
tambahan, dan pada PM2 mode fork (satu proses) hitungan memori sudah akurat. Redis resmi
tidak ada di Windows (perlu Memurai/Docker).

Pasang hanya kalau PM2 pindah ke cluster atau aplikasi dibuka dari luar kantor:
`REDIS_URL=redis://localhost:6379` di `.env.local`, restart PM2, tanpa mengubah kode.
Jangan diisi "biar aman" — Redis yang tidak terpasang membanjiri log dengan `DEGRADED`, dan
sinyal itu jadi tak berarti saat Redis sungguhan suatu hari mati.

Satu baris keterangan saat start (`mode memori per-proses … konfigurasi normal`) adalah
wajar. `DEGRADED` berarti backend yang **sudah dikonfigurasi** gagal dijangkau:

```powershell
pm2 logs prima --lines 500 --nostream | findstr DEGRADED
```

---

# BAGIAN D — GOOGLE DRIVE

## §12 Menyambungkan Google Drive

Drive menyimpan lampiran usulan, gambar & arsip Word LKJIP, bukti BBA, cadangan BLUD,
backup database, dan salinan kedua lampiran. Yang disimpan PRIMA di database hanya
**ID berkas**; berkasnya dibaca lewat token aplikasi setiap kali dibuka.

### 12.1 Akun

Gunakan **akun Google khusus PRIMA** dengan 2FA aktif, sandi & pemulihan dipegang IT — bukan
akun pribadi staf. Token melekat pada akun pembuatnya: kalau akun itu hilang, unggahan
berhenti DAN berkas lama tidak terbaca lagi (§20).

### 12.2 OAuth client (sekali)

Login ke `console.cloud.google.com` **dengan akun PRIMA**:

1. **Buat project** baru, mis. `PRIMA`.
2. **APIs & Services → Library** → cari **Google Drive API** → **Enable**.
3. **OAuth consent screen** (Google Auth Platform): tipe **External**, isi nama aplikasi
   (`PRIMA`) dan email dukungan. Tambahkan scope Drive yang dipilih di 12.3.
4. Di bagian **Audience**, ubah status publikasi ke **In production**. ⚠️ Kalau dibiarkan
   **Testing**, refresh token **kedaluwarsa sesudah 7 hari** dan unggahan berhenti dengan
   `invalid_grant`.
5. **Credentials → Create credentials → OAuth client ID** → tipe **Web application** →
   **Authorized redirect URIs**: `https://developers.google.com/oauthplayground` →
   Create. Catat **Client ID** dan **Client secret**.

### 12.3 Refresh token

1. Buka `https://developers.google.com/oauthplayground`.
2. Ikon ⚙ (kanan atas) → centang **Use your own OAuth credentials** → tempel Client ID &
   Client secret.
3. Kotak **Step 1**, ketik scope (lihat tabel di bawah) → **Authorize APIs** → login dengan
   **akun PRIMA**. Kalau muncul "Google hasn't verified this app", pilih **Advanced →
   Go to PRIMA** — aplikasinya milik Anda sendiri.
4. **Step 2 → Exchange authorization code for tokens** → salin **Refresh token**.
5. Isi `.env.local`:
   ```
   GOOGLE_OAUTH_CLIENT_ID="…apps.googleusercontent.com"
   GOOGLE_OAUTH_CLIENT_SECRET="…"
   GOOGLE_OAUTH_REFRESH_TOKEN="…"
   ```

| Scope | Arti | Kapan |
|---|---|---|
| `https://www.googleapis.com/auth/drive.file` | aplikasi hanya melihat berkas yang ia buat sendiri | **yang dipakai sekarang**. Aman bila akunnya akun pribadi |
| `https://www.googleapis.com/auth/drive` | aplikasi bisa membaca seluruh Drive akun itu | syarat agar berkas lama tetap terbuka **sesudah pindah akun** (§20). Pakai HANYA untuk akun khusus PRIMA — token yang bocor membuka seluruh isi akun |

### 12.4 Folder induk

1. Di Drive akun PRIMA, buat satu folder, mis. `PRIMA`.
2. **Bagikan → Akses umum → Dibatasi (Restricted).** Subfolder yang dibuat aplikasi
   mewarisi pengaturan ini; isi lampiran tidak terenkripsi.
3. Salin **ID**-nya — ujung URL `https://drive.google.com/drive/folders/<ID>`, bukan URL
   utuh — ke `.env.local`:
   ```
   GOOGLE_DRIVE_FOLDER_ID_ROOT="<ID>"
   ```
   (Atau isi lewat Admin Panel → Drive & Backup; isian panel mengalahkan `.env.local`.)
4. Restart aplikasi (`pm2 restart prima`).

PRIMA membuat sendiri subfolder `01 Backup Database` · `02 LKJIP` · `03 Cadangan BLUD` ·
`04 Buku Besar Aset` · `05 Lampiran Usulan` · `06 Salinan Lampiran` saat pertama dibutuhkan.
Berkas lama **tidak dipindah** — tetap di folder lamanya dan dibuka lewat ID-nya; subfolder
02–05 baru terisi oleh unggahan sesudahnya.

### 12.5 Uji

**Admin Panel → Drive & Backup** (khusus SUPER_ADMIN):

- **Folder Induk** — "Berlaku: … DARI .env.local" (atau "dari panel").
- **UJI SEKARANG** — menulis, membaca, lalu menghapus satu berkas kecil di tiap tujuan, dan
  membaca **berkas lama** tertua & terbaru. Semua baris harus **OK**.

| Kode merah | Artinya |
|---|---|
| `token` | refresh token salah/dicabut, atau consent screen masih Testing (12.2 langkah 4) |
| `permission` | folder tujuan tidak bisa diisi akun token |
| `quota` | Drive akun penuh |
| `lama_tak_terbaca` | berkas lama tidak terbaca token ini — hampir selalu sesudah pindah akun (§20) |

Kolom "Berkas lama" bertanda **—** artinya belum ada berkas lama yang tercatat untuk tujuan
itu (mis. modul belum pernah dipakai mengunggah) — bukan kesalahan.

---

# BAGIAN E — BACKUP

## §13 Persiapan backup

Backup harian: `mysqldump` → gzip → enkripsi AES-256-GCM (`BACKUP_ENC_PASSWORD`) → unggah ke
`01 Backup Database` → hapus berkas lokal → catat di `drive_arsip` & `drive_health` → rotasi
→ salinan kedua lampiran → log `scripts\backup-db.log`. Skripnya `scripts\backup-db.js`.

### 13.1 `mysqldump.exe`

```powershell
Get-ChildItem C:\laragon\bin\mysql -Recurse -Filter mysqldump.exe | Select-Object -ExpandProperty FullName
```

Tulis hasilnya di `.env.local`:

```
MYSQLDUMP_PATH="C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysqldump.exe"
```

Tanpa ini tugas terjadwal (`SYSTEM`) hampir pasti tidak menemukan mysqldump
(`ENOENT`). Memeriksa isinya tanpa menampilkan nilai rahasia:

```powershell
Select-String -Path D:\APLIKASI\prima-web-3\.env.local -Pattern '^MYSQLDUMP_PATH','^BACKUP_ENC_PASSWORD','^GOOGLE_DRIVE_FOLDER_ID_ROOT' | ForEach-Object { $_.Line.Split('=')[0] }
```

### 13.2 Uji dengan tangan dulu

Jangan memasang jadwal sebelum skripnya terbukti jalan — kalau tidak, kegagalan tugas dan
kegagalan skrip tidak bisa dibedakan.

```powershell
cd D:\APLIKASI\prima-web-3
node scripts/backup-db.js
```

Hasil yang benar (jam di awal baris = **UTC**, nama berkas = **WIB**):

```
2026-11-16T00:46:36Z [DUMP-OK] prima-db-2026-11-16-07-46.sql.gz.enc (61420 KB)
2026-11-16T00:49:30Z [UPLOAD-OK] prima-db-2026-11-16-07-46.sql.gz.enc → Drive folder backup
2026-11-16T00:49:30Z [DONE] selesai 182.5s · retensi 30 · rotasi hapus 0
2026-11-16T00:52:08Z [SALINAN] lampiran 48 · lokal 48 (+48, …) · Drive 48 (+48, …)
```

Tunggu sampai prompt PowerShell kembali — sesudah `DONE` skrip masih menyalin lampiran.
Jalan pertama menyalin semua lampiran lama (berhenti di 40 menit, sisanya dilanjutkan
jalan berikutnya); jalan sesudahnya hanya menyalin yang baru (`+0` kalau tidak ada).

Lalu periksa: Drive → folder induk → `01 Backup Database` berisi berkas tadi, dan panel
Drive & Backup tidak lagi berspanduk "Belum ada backup".

## §14 Jadwal backup harian

### 14.1 Cari tugas lama dulu — dengan saringan lebar

Server yang sudah lama jalan kemungkinan punya tugas backup lama, mungkin lewat
pembungkus `.cmd` sehingga argumennya tidak menyebut `backup-db`. Di server PRIMA, tugas
lama `PRIMA Backup DB` (pembungkus `.cmd`, jadwal 01.00) lolos dari saringan sempit dan
terus mengunggah ke folder lama. PowerShell **sebagai Administrator**:

```powershell
Get-ScheduledTask | Where-Object { ($_.Actions.Execute + ' ' + $_.Actions.Arguments) -match 'backup|prima' } |
  ForEach-Object { $i = $_ | Get-ScheduledTaskInfo
    [pscustomobject]@{ Nama=$_.TaskName; Program=$_.Actions.Execute; Argumen=$_.Actions.Arguments
      Folder=$_.Actions.WorkingDirectory; Akun=$_.Principal.UserId; Terakhir=$i.LastRunTime; Hasil=$i.LastTaskResult; Berikutnya=$i.NextRunTime } } | Format-List
```

| Yang terlihat | Langkah |
|---|---|
| Tugas `PRIMA - hidupkan aplikasi` & `PRIMA - …` cron | **jangan disentuh** |
| Tidak ada tugas backup | pasang di 14.2 |
| Satu tugas backup | pasang di 14.2 **dengan nama tugas itu** — `-Force` menimpanya |
| Dua atau lebih | sisakan satu: `Unregister-ScheduledTask -TaskName '<nama>' -Confirm:$false` |

### 14.2 Memasang

```powershell
$app  = 'D:\APLIKASI\prima-web-3'
$node = 'C:\Program Files\nodejs\node.exe'   # hasil §1

$aksi = New-ScheduledTaskAction -Execute $node -Argument 'scripts\backup-db.js' -WorkingDirectory $app
$jam  = New-ScheduledTaskTrigger -Daily -At 12:00
$atur = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
          -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'PRIMA Backup DB' `
  -Description 'Backup harian MySQL PRIMA -> Google Drive. Panduan: docs\panduan\PANDUAN-instalasi-prima.md §14' `
  -Action $aksi -Trigger $jam -Settings $atur -User 'SYSTEM' -RunLevel Highest -Force
```

Keluarannya satu baris `PRIMA Backup DB   Ready`.

| Setelan | Alasan |
|---|---|
| **Jam 12:00** | laptop mati tiap malam. Jadwal 01:00 baru jalan pagi saat laptop menyala — persis saat MySQL mungkin belum siap (terbukti: `Can't connect to MySQL` dua hari berturut-turut). `mysqldump --single-transaction` tidak mengunci tabel, jadi jam kerja tidak mengganggu pemakai |
| `-StartWhenAvailable` | laptop mati/tidur jam 12:00 → backup menyusul begitu menyala |
| izin baterai | tanpa ini backup berhenti diam-diam saat kabel dicabut |
| `SYSTEM` + highest | jalan walau tak ada yang login, tanpa sandi Windows tersimpan, tanpa jendela hitam |
| path lengkap Node + `MYSQLDUMP_PATH` | `SYSTEM` tidak melihat PATH akun Anda |
| `WorkingDirectory` | argumen relatif `scripts\backup-db.js` |
| batas 1 jam | salinan lampiran berhenti sendiri di 40 menit; tugas menggantung dihentikan |
| `IgnoreNew` | dua backup bersamaan saling mengganggu rotasi (skrip juga memegang kunci `backups-pending\.lock`) |
| sekali sehari | `BACKUP_RETENTION` menghitung **berkas**, bukan hari: 30 berkas = 30 hari kalau sehari sekali |

### 14.3 Membuktikan — tiga bukti, ketiganya wajib

```powershell
Start-ScheduledTask -TaskName 'PRIMA Backup DB'
Start-Sleep -Seconds 120
Get-ScheduledTaskInfo -TaskName 'PRIMA Backup DB' | Select-Object LastRunTime, LastTaskResult, NextRunTime
Get-Content D:\APLIKASI\prima-web-3\scripts\backup-db.log -Tail 8 -Encoding UTF8
```

1. `LastTaskResult` **0** (masih `267009` = sedang berjalan, tunggu lalu ulangi).
2. Log berisi `[UPLOAD-OK]` + `[DONE]` dengan jam barusan — **ini bukti terpenting**:
   kode 0 hanya membuktikan Node mau dijalankan.
3. Berkasnya ada di `01 Backup Database`, dan `NextRunTime` = 12:00 berikutnya.

`-Encoding UTF8` hanya supaya tanda panah tidak tampil sebagai `â†'`.

### 14.4 Mengubah & mematikan

| Keperluan | Perintah (Administrator) |
|---|---|
| Ganti jam | `Set-ScheduledTask -TaskName 'PRIMA Backup DB' -Trigger (New-ScheduledTaskTrigger -Daily -At 15:00)` |
| Matikan sementara / hidupkan | `Disable-ScheduledTask` / `Enable-ScheduledTask -TaskName 'PRIMA Backup DB'` |
| Backup sekarang | `Start-ScheduledTask -TaskName 'PRIMA Backup DB'` |
| Folder aplikasi atau Node pindah | ulangi 14.2 dengan `$app`/`$node` baru (nama sama → ditimpa) |

Untuk mengubah setelan, ulangi 14.2 utuh — jangan `-Settings (New-ScheduledTaskSettingsSet …)`.

## §15 Salinan lampiran, pemantauan, restore

### 15.1 Salinan kedua lampiran

Backup database hanya menyimpan **ID** lampiran. Karena itu skrip backup juga menyalin semua
lampiran (`uploaded_files` + arsip Word LKJIP) ke:

- **laptop server** — `BACKUP_LAMPIRAN_DIR`, berkas `<modul>\<ID>__<nama>`, **tidak
  terenkripsi** (jangan bagikan foldernya);
- **Drive** — `06 Salinan Lampiran`, nama `[modul] <nama>`, asalnya tercatat di
  `drive_arsip.asal_file_id`.

Lampiran yang hilang dari Drive dipulihkan dengan mengunggah ulang berkas dari salinan
lewat layar modulnya (ID lama tidak bisa dihidupkan kembali).

### 15.2 Pemantauan — cukup sebulan sekali

**Admin Panel → Drive & Backup**: backup terbaru (ukuran + sidik SHA-256), kesehatan per
tujuan, ringkasan salinan lampiran. Spanduk **kuning** = backup hari ini belum naik padahal
sudah lewat 14.00; **merah** = backup terakhir lebih dari 4 hari lalu. Tekan **UJI SEKARANG**.

Lewat PowerShell:

```powershell
$i = Get-ScheduledTaskInfo -TaskName 'PRIMA Backup DB'
"Terakhir: $($i.LastRunTime)  hasil: $($i.LastTaskResult)  berikutnya: $($i.NextRunTime)"
Get-Content D:\APLIKASI\prima-web-3\scripts\backup-db.log -Tail 200 -Encoding UTF8 | Select-String 'UPLOAD-OK' | Select-Object -Last 5
Get-ChildItem D:\APLIKASI\prima-web-3\backups-pending -Filter *.enc -ErrorAction SilentlyContinue
```

`backups-pending` berisi berkas lebih tua dari kemarin = unggahan gagal terus (token/internet).

Backup lama di folder **sebelum** folder induk dipakai tidak ikut dirotasi — hapus manual
dari Drive bila sudah tidak diperlukan.

### 15.3 Restore

⚠️ Restore **MENIMPA** seluruh isi database dengan keadaan saat backup dibuat. Perubahan
sesudah jam backup hilang (kecuali binlog, 15.5). Kerjakan dengan aplikasi dijeda (§8.3).

1. Unduh `prima-db-….sql.gz.enc` dari `01 Backup Database`. Cocokkan sidiknya dengan panel
   (8 karakter pertama):
   ```powershell
   (Get-FileHash .\prima-db-2026-11-16-07-46.sql.gz.enc).Hash.Substring(0,8).ToLower()
   ```
2. Dekripsi (butuh `BACKUP_ENC_PASSWORD`, dibaca dari `.env.local` atau variabel lingkungan):
   ```powershell
   cd D:\APLIKASI\prima-web-3
   node scripts/backup-decrypt.js D:\unduhan\prima-db-2026-11-16-07-46.sql.gz.enc
   ```
   Menghasilkan `prima-db-2026-11-16-07-46.sql`.
3. Impor (dump memuat `CREATE DATABASE`, jadi bisa ke server kosong):
   ```powershell
   mysql --user=root --password < D:\unduhan\prima-db-2026-11-16-07-46.sql
   ```
   atau HeidiSQL → File → Load SQL file → Execute.
4. **Hapus berkas `.sql` hasil dekripsi** — isinya data sensitif tanpa enkripsi.
5. `node scripts/check-schema.mjs`, lalu `prima-lanjut.ps1`.

### 15.4 Uji restore — wajib tiap 6 bulan

Backup yang tidak pernah dicoba dipulihkan belum tentu backup. Ambil berkas terbaru,
pulihkan ke database **percobaan** (bukan `prima_db`), periksa beberapa tabel berisi data
wajar, lalu hapus database percobaan itu. Catat tanggal & hasilnya di tabel §2.

### 15.5 Lapis 2 — kembali ke menit tertentu (opsional)

Binary log MySQL memungkinkan mundur ke menit tertentu di antara dua backup harian. Di
`my.ini` bagian `[mysqld]`:

```ini
log-bin = mysql-bin
binlog_expire_logs_seconds = 604800   # simpan 7 hari
```

Restart MySQL. Pemulihan: restore backup terakhir, lalu putar binlog sampai sebelum kejadian:

```powershell
mysqlbinlog --stop-datetime="2026-11-16 10:22:00" mysql-bin.000123 | mysql -u root -p
```

## §16 Selesai memasang — catat

Isi tabel pemegang di §2, simpan `BACKUP_ENC_PASSWORD` di luar server, lalu kerjakan §17.

---

# BAGIAN F — OPERASI

## §17 Daftar periksa sesudah pemasangan

Kerjakan berurutan; berhenti di langkah pertama yang gagal.

- [ ] `pm2 status` → `prima` **online**
- [ ] Buka alamat aplikasi dari **komputer lain** → halaman login muncul
- [ ] Login `superadmin` → masuk dan **tetap masuk** sesudah pindah halaman (kalau terlempar
      balik ke login: `COOKIE_SECURE=false` belum diisi)
- [ ] Akun uji salah sandi 5× → terkunci 15 menit
- [ ] `/menu` → kartu aplikasi sesuai hak akses; `/blud/dpa` tampil tanpa galat
- [ ] `node scripts/check-schema.mjs` → **SINKRON**
- [ ] `node scripts/cek-tahap-0.mjs` → **PUTUSAN** `OK`, tanpa sakelar `!!` yang tak sengaja mati
- [ ] Sakelar → **MAINTENANCE** satu modul, dengan akun **bukan** SUPER_ADMIN: kartu abu-abu,
      URL modul dilempar ke "Sedang Dalam Perbaikan", halaman login menyebut modulnya.
      Nyalakan lagi
- [ ] Sakelar → **BEKU** satu modul: layar terbuka, spanduk tampil, Simpan mati bertooltip.
      Nyalakan lagi
- [ ] Unduh satu berkas Excel/Word dari modul mana pun
- [ ] Riwayat PK → satu dokumen FINAL → **Unduh PDF** → PDF terbuka, tanpa tulisan
      "perkiraan tampilan" di pratinjau (kalau ditolak "LibreOffice belum terpasang": §1.1)
- [ ] Drive & Backup → **UJI SEKARANG** → semua OK
- [ ] Lima tugas cron dijalankan dengan tangan → `cron.log` berisi `OK` (§9.3)
- [ ] Backup lewat penjadwal → log `UPLOAD-OK` (§14.3)
- [ ] `Get-ScheduledTask -TaskName 'PRIMA*'` → semua terdaftar, izin baterai menyala:
      ```powershell
      Get-ScheduledTask -TaskName 'PRIMA*' | ForEach-Object { "$($_.TaskName.PadRight(28)) boleh-baterai=$(-not $_.Settings.DisallowStartIfOnBatteries)" }
      ```
- [ ] **Cabut kabel listrik**, tunggu satu putaran jadwal → `cron.log` tetap bertambah
- [ ] Restart Windows → login → tunggu ~2 menit → `pm2 list` **online** tanpa diketik apa pun
- [ ] `pm2 logs prima --lines 200 --nostream` → tidak ada galat berulang

## §18 Memutakhirkan versi

### 18.1 Urutan

```powershell
cd D:\APLIKASI\prima-web-3
Start-ScheduledTask -TaskName 'PRIMA Backup DB'      # 1. backup dulu, tunggu UPLOAD-OK di log
git pull origin main                                  # 2. ambil kode
npm ci                                                # 3. hanya kalau package.json/package-lock.json berubah
node scripts/check-schema.mjs                         # 4. tabel/kolom/indeks yang belum ada
```

5. Jalankan **migrasi yang belum pernah masuk**, berurutan, dari
   `D:\APLIKASI\prima-web-3\docs\migrations\` (lihat 18.2). Ulangi `check-schema` sampai
   **SINKRON**.
6. Build & restart:
   ```powershell
   D:\APLIKASI\prima-jeda.ps1
   npm run build
   D:\APLIKASI\prima-lanjut.ps1
   ```
   Jangan `pm2 stop prima` langsung — pemeriksaan 15 menit menyalakannya di tengah build.
7. `node scripts/cek-tahap-0.mjs` sekali — menunjukkan sakelar yang tertinggal mati.

Perubahan yang **hanya** menyentuh `scripts\backup-db.js` atau berkas skrip lain tidak perlu
build/restart — skrip dibaca ulang setiap kali jalan.

Server yang dipasang sebelum 2026-11-16 belum punya **LibreOffice**. Pasang sekali (§1.1)
supaya PDF Perjanjian Kinerja bisa dibuat; tidak perlu build ulang untuk itu.

### 18.2 Migrasi — aturan yang mencegah kesalahan

- **Buka berkas migrasi dari folder aplikasi yang barusan di-pull**, bukan salinan lama di
  tempat lain atau tab HeidiSQL yang masih terbuka dari kemarin. Di server PRIMA pernah
  terjadi: tab HeidiSQL memuat versi lama `migration-drive-arsip.sql`, sehingga satu kolom
  tidak pernah dibuat.
- **Catat sendiri** migrasi yang sudah dijalankan — tidak ada catatan otomatis. Satu berkas
  teks di luar repo, mis. `D:\APLIKASI\migrasi-dijalankan.txt`: nama berkas + tanggal.
- `check-schema` hanya melihat **tabel, kolom, indeks, dan tipe**. Migrasi yang hanya
  **mengubah isi data** (`UPDATE`/`INSERT`/`DELETE` tanpa `ALTER`/`CREATE`) tidak
  terdeteksi — di situlah catatan sendiri diperlukan. Baca kepala tiap berkas migrasi:
  yang wajib sebelum kodenya dipasang menyebutnya dengan jelas.
- `CREATE TABLE IF NOT EXISTS` **tidak** menambah kolom ke tabel yang sudah ada. Kolom
  susulan selalu datang sebagai berkas `ALTER` tersendiri; galat `1060 Duplicate column` atau
  `1061 Duplicate key` saat menjalankannya ulang artinya sudah ada — aman diabaikan.
- Isian `.env.local` bukan SQL — jangan dijalankan di HeidiSQL (§6).
- Migrasi perbaikan akses 2026-09-14 — keduanya aman diulang:
  `migration-hapus-sakelar-yatim.sql` (buang tiga sakelar tanpa modul) dan
  `migration-seed-sakelar-lengkap.sql` (lengkapi baris sakelar yang belum diseed).

## §19 Membaca gangguan

### 19.1 Aplikasi

| Gejala | Kemungkinan besar |
|---|---|
| `npm ci` gagal `EUSAGE` | npm bukan 10.8.2 |
| Build berhenti menyebut `JWT_SECRET` | `.env.local` belum benar — disengaja |
| Build gagal `TS2307 Cannot find module '…/route.js'` di `.next/…/types` | jangan hapus skrip `prebuild` di `package.json`; jalankan `npm run build` (bukan `next build`) |
| Login "berhasil" lalu balik ke halaman login | `COOKIE_SECURE=false` belum diisi padahal aksesnya HTTP |
| Login terlempar padahal sudah HTTPS | `X-Forwarded-Proto` tidak diteruskan Nginx |
| Satu akun tak bisa login 15 menit | normal: 5× salah sandi, tidak menular ke rekan |
| "Coba lagi dalam N detik" padahal sandi benar | jatah 10 login/menit akun itu habis — tunggu |
| Tautan di email salah alamat | `NEXT_PUBLIC_APP_URL` keliru |
| Promosi peran menggantung | tugas cron belum terpasang (§9) |
| Satu modul 503 / "Sedang Dalam Perbaikan" | sakelarnya MAINTENANCE di Admin Panel |
| Kueri mengeluh `GROUP BY` | `ONLY_FULL_GROUP_BY` dimatikan (§3) |
| Aplikasi mati tiap pagi | `autostart.log` (§8.2) — biasanya MySQL belum hidup atau akun tugas salah |
| Lampiran tidak terunggah, tanpa galat | kredensial Google kosong/salah — Drive & Backup → Uji |
| Galat SQL 1064 menyebut `GOOGLE_DRIVE…` | isian `.env.local` dijalankan di HeidiSQL (§6) |
| PDF PK ditolak "LibreOffice belum terpasang" / pratinjau Riwayat PK bertulisan "perkiraan tampilan" | LibreOffice belum terpasang atau tidak di `C:\Program Files\LibreOffice` — §1.1, atau isi `LIBREOFFICE_PATH` |
| PDF PK gagal "selesai tanpa menghasilkan PDF" | periksa `LIBREOFFICE_PATH` menunjuk `soffice.com`, bukan `soffice.exe` (§1.1) |

### 19.2 Log backup (`scripts\backup-db.log`)

| Baris | Penyebab | Yang dilakukan |
|---|---|---|
| `[FATAL] .env.local tidak ditemukan` | tugas menunjuk salinan skrip di luar folder aplikasi | periksa Argumen & Folder tugas (14.1) |
| `[FATAL] env BACKUP_ENC_PASSWORD kosong/terlalu pendek` | belum diisi / < 16 karakter | §6 |
| `[FATAL] env MYSQL_… / GOOGLE_OAUTH_… kosong` | belum diisi | §6 |
| `[FATAL] mysqldump tidak bisa dijalankan (ENOENT)` | `MYSQLDUMP_PATH` kosong/salah | §13.1 |
| `[FATAL] mysqldump exit 2: … Can't connect` | MySQL mati di jam backup | Laragon otomatis menyala (§3); jangan jadwal dini hari |
| `[FATAL] mysqldump exit 2: … Access denied` | `MYSQL_USER`/`PASSWORD` salah | samakan dengan aplikasi |
| `[FOLDER-FAIL] … File not found` | ID folder induk salah ketik / tak bisa ditulis | ID = ujung URL `…/folders/<ID>`; dump tetap menunggu di `backups-pending` |
| `[UPLOAD-FAIL] … ENOTFOUND` / `ETIMEDOUT` | internet mati | tidak perlu apa-apa — terunggah di jalan berikutnya |
| `[UPLOAD-FAIL]` / `[RETRY-FAIL]` `invalid_grant` | refresh token dicabut, kedaluwarsa (consent Testing), atau sandi akun Google diganti | buat ulang token (§12.3) |
| `[UPLOAD-FAIL] … storageQuotaExceeded` | Drive penuh | kosongkan Drive / turunkan `BACKUP_RETENTION` |
| `[ROTATE-FAIL]` | gagal menghapus backup lama | backup hari itu aman; periksa besok |
| `[SALINAN] … gagal N` | sebagian lampiran tak tersalin | dicoba lagi besok |
| `[SALINAN] … hilang N` | lampiran sudah dihapus dari Drive | tidak bisa dipulihkan dari Drive |
| `[SALINAN-FAIL]` | salinan berhenti total | backup database tetap sah; baca pesannya |
| `[LEWAT] backup lain sedang berjalan` | manual & terjadwal berbarengan | normal. Muncul terus tanpa backup lain → hapus `backups-pending\.lock` |
| `[CATAT-FAIL] … drive_arsip doesn't exist` | migrasi Drive belum dijalankan | `migration-drive-arsip.sql` lalu `migration-drive-arsip-asal.sql` |
| log tidak bertambah sama sekali | tugas tidak pernah dimulai | 19.3 + izin baterai (§9.1) |

### 19.3 Kode hasil Task Scheduler

| `LastTaskResult` | Arti |
|---|---|
| `0` | selesai tanpa galat |
| `1` | skrip jalan tapi gagal → baca log |
| `267009` (`0x41301`) | sedang berjalan |
| `267011` (`0x41303`) | belum pernah jalan sejak dipasang |
| `2147942402` (`0x80070002`) | program tidak ditemukan — path Node salah |
| `2147942667` (`0x8007010B`) | folder kerja tidak ada, atau ditulis bertanda kutip |
| `2147943726` (`0x8007052E`) | akun/sandi salah — tugas bukan `SYSTEM` |
| `2147946720` (`0x800710E0`) | ditolak penjadwal — biasanya aturan baterai |

## §20 Serah terima & pindah akun Google

### 20.1 Yang diserahkan ke pengelola baru

1. Tabel pemegang di §2, terisi dan terbaru.
2. Akses ke tempat penyimpanan `.env.local` & `BACKUP_ENC_PASSWORD`.
3. Akses ke akun Google PRIMA (atau pemulihannya) — lewat IT, bukan dari ponsel satu orang.
4. Bukti hidup: Drive & Backup → **UJI SEKARANG** hijau, dan `UPLOAD-OK` hari itu.

### 20.2 Tiga keadaan

| Yang diganti | Berkas lama | Langkah |
|---|---|---|
| **Server saja** (akun sama) | tetap terbaca | salin `.env.local` (tiga `GOOGLE_OAUTH_*` + folder) ke server baru. ID folder tidak berubah |
| **Refresh token saja** (akun & OAuth client sama) | tetap terbaca | §12.3 dengan client yang sama, ganti satu baris, restart |
| **Akun Google baru** | **tidak terbaca**, kecuali (a) folder lama DIBAGIKAN ke akun baru dan (b) token akun baru ber-scope `drive` penuh | 20.3 |

### 20.3 Pindah akun Google

1. Siapkan akun tujuan: khusus PRIMA, 2FA, pemulihan di IT.
2. Dari akun lama, **bagikan semua folder** yang pernah dipakai (induk, folder lama per
   tujuan, folder backup) ke akun tujuan sebagai **Editor**.
3. Buat folder induk baru di akun tujuan (atau tetap memakai folder lama yang sudah dibagikan).
4. Ambil refresh token akun tujuan dengan scope **`drive` penuh** (§12.3), lewat OAuth client
   di project Google Cloud yang sama bila masih bisa diakses.
5. Ganti tiga `GOOGLE_OAUTH_*` (dan folder induk) di `.env.local`, restart.
6. **UJI SEKARANG** — semua OK, **termasuk "berkas lama"**. `lama_tak_terbaca` = langkah 2
   atau scope langkah 4 belum benar.
7. Jalankan backup manual → `UPLOAD-OK`.
8. Buka satu lampiran lama dari layar Usulan/BBA dan unduh satu Word LKJIP bergambar.
9. **Jangan menyalin berkas ke akun baru** — salinan = ID baru, rujukan di 9 tempat putus.
10. **Jangan menghapus akun lama** selama datanya masih dibutuhkan (praktisnya: selama
    tahun-tahun itu masih diaudit). Menghapusnya = menghapus lampiran, bukti, dan gambar
    yang ID-nya masih dirujuk PRIMA.

Rollback: kembalikan tiga nilai + folder lama, restart — berkas tidak disentuh, jadi tidak
ada data yang hilang. Rincian & alasan: `docs/konsep/sistem/CONCEPT-drive-terpusat.md` §11.

---

## Catatan tentang panduan ini

Disusun 2026-11-16 dari tiga panduan lama ditambah pemasangan sungguhan di server PRIMA
hari itu (migrasi Drive & pagu Renaksi, sandi superadmin, folder induk, jadwal backup,
salinan lampiran). Bagian yang **belum** pernah dicoba di server kantor: HTTPS lewat Nginx
(§11.2), Redis (§11.3), restore penuh dari backup (§15.3 — wajib diuji, §15.4), dan
pindah akun Google (§20.3). Perlakukan §17 sebagai bagian wajib: di sanalah isi panduan
ini diuji terhadap kenyataan server Anda.
