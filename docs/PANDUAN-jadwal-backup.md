# Panduan — Memasang Backup Database Otomatis (Windows Task Scheduler)

Panduan ini memasang **satu tugas terjadwal** yang menjalankan `scripts/backup-db.js`
setiap hari: database MySQL dibuang (mysqldump), dikompres, dienkripsi, lalu diunggah ke
Google Drive. Sesudahnya skrip yang sama membuat **salinan kedua lampiran** semua modul
(usulan, BBA, LKJIP) — di laptop ini dan di folder Drive "06 Salinan Lampiran" — karena
lampiran tidak ada di dalam backup database (yang tersimpan di database hanya ID-nya). Ditulis untuk server PRIMA yang berupa **laptop yang dimatikan tiap malam**
— kalau server Anda menyala 24 jam, semua langkah tetap berlaku, hanya jamnya yang boleh
digeser.

Isi:

1. [Sebelum mulai — periksa 6 hal](#1-sebelum-mulai--periksa-6-hal)
2. [Uji skripnya dengan tangan dulu](#2-uji-skripnya-dengan-tangan-dulu)
3. [Periksa tugas yang mungkin sudah ada](#3-periksa-tugas-yang-mungkin-sudah-ada)
4. [Memasang tugas — cara cepat (PowerShell)](#4-memasang-tugas--cara-cepat-powershell)
5. [Memasang tugas — cara klik (layar Task Scheduler)](#5-memasang-tugas--cara-klik-layar-task-scheduler)
6. [Membuktikan tugasnya benar-benar jalan](#6-membuktikan-tugasnya-benar-benar-jalan)
7. [Pemeriksaan rutin (cukup sebulan sekali)](#7-pemeriksaan-rutin-cukup-sebulan-sekali)
8. [Mengubah, mematikan sementara, menghapus](#8-mengubah-mematikan-sementara-menghapus)
9. [Membaca kegagalan](#9-membaca-kegagalan)
10. [Kenapa setelannya begini](#10-kenapa-setelannya-begini)

Restore (memulihkan dari berkas backup) **tidak** dibahas di sini — lihat
`docs/BACKUP-RESTORE.md` §Restore. Tugas terjadwal lain (cron aplikasi, menghidupkan
aplikasi) ada di `docs/PANDUAN-pemasangan-windows.md` §4 dan §5.

Di seluruh panduan, `C:\apps\prima` = folder aplikasi PRIMA (tempat `package.json` dan
`.env.local`). **Ganti dengan folder Anda sendiri.**

---

## 1. Sebelum mulai — periksa 6 hal

Semua dilakukan di laptop/server PRIMA, di PowerShell biasa (bukan Administrator).

### 1.1 Node.js terpasang dan path lengkapnya diketahui

```powershell
(Get-Command node).Source
```

Hasilnya biasanya `C:\Program Files\nodejs\node.exe`. **Catat persis** — Task Scheduler
dipasang dengan path lengkap ini, bukan sekadar `node`, karena tugas yang berjalan
sebagai `SYSTEM` tidak selalu memakai PATH yang sama dengan jendela PowerShell Anda.

Kalau perintah di atas galat, Node belum terpasang (atau terpasang hanya untuk satu
akun lewat nvm). Pasang Node.js LTS dari nodejs.org untuk **semua pengguna**.

### 1.2 `mysqldump.exe` ditemukan

Laragon menaruhnya di dalam folder MySQL-nya. Cari:

```powershell
Get-ChildItem C:\laragon\bin\mysql -Recurse -Filter mysqldump.exe | Select-Object -ExpandProperty FullName
```

Isi path lengkapnya ke `.env.local` (garis miring biasa atau terbalik sama-sama boleh):

```
MYSQLDUMP_PATH="C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysqldump.exe"
```

Tanpa baris ini skrip mencari `mysqldump` di PATH — dan di bawah `SYSTEM` hampir pasti
tidak ketemu (log: `mysqldump tidak bisa dijalankan (ENOENT)`).

### 1.3 Isi `.env.local` yang dipakai backup

Buka `C:\apps\prima\.env.local`, pastikan baris-baris ini ada dan **berisi**:

| Baris | Wajib? | Catatan |
|---|---|---|
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | ya | sama dengan yang dipakai aplikasi |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | ya | sama dengan yang dipakai aplikasi |
| `GOOGLE_DRIVE_FOLDER_ID_ROOT` | salah satu | folder induk PRIMA; backup masuk subfolder **01 Backup Database** yang dibuat sendiri |
| `GOOGLE_DRIVE_FOLDER_ID_BACKUP` | salah satu | dipakai hanya bila `_ROOT` kosong |
| `BACKUP_ENC_PASSWORD` | ya, min 16 karakter | tanpa ini backup **tidak dibuat sama sekali** (dump polos tidak boleh naik ke cloud) |
| `MYSQLDUMP_PATH` | sangat disarankan | lihat 1.2 |
| `BACKUP_RETENTION` | tidak | jumlah berkas yang disimpan di Drive, bawaan `30` |
| `BACKUP_LAMPIRAN_DIR` | disarankan | folder salinan lampiran di laptop, mis. `D:/backup-prima/lampiran`. Kosong = `<folder aplikasi>\backups-lampiran`. Butuh ruang disk sebesar seluruh lampiran (lihat panel Drive & Backup sesudah jalan pertama) |
| `GOOGLE_DRIVE_FOLDER_ID_SALINAN` | tidak | hanya bila TANPA folder induk; dengan folder induk subfolder "06 Salinan Lampiran" dibuat sendiri |

⚠️ **Salin `BACKUP_ENC_PASSWORD` ke tempat aman di luar laptop ini** (pengelola sandi,
atau amplop tertutup di lemari terkunci). Kalau laptopnya rusak total dan sandi ini ikut
hilang, **semua** berkas backup di Drive tidak bisa dibuka siapa pun.

Skrip membaca `.env.local` sendiri setiap kali jalan — mengubah isinya **tidak** perlu
restart aplikasi maupun memasang ulang tugas.

### 1.4 MySQL (Laragon) menyala saat jam backup

Backup butuh MySQL hidup. Kalau Laragon dinyalakan manual, pastikan kebiasaan itu terjadi
sebelum jam backup (bagian 4 memakai jam 12:00). Kalau MySQL mati saat tugas jalan, log
berbunyi `mysqldump exit 2 … Can't connect` dan backup hari itu tidak ada — tugas tidak
mengulang sendiri di hari yang sama.

### 1.5 Folder Drive bisa ditulis

Kalau memakai folder induk: folder itu milik akun Google yang sama dengan token di
`.env.local`, atau sudah **dibagikan sebagai Editor** ke akun itu. Atur folder induk ke
**Restricted** (Bagikan → Akses umum → Dibatasi) — subfolder backup mewarisi aksesnya.
Isi backup terenkripsi, tapi lampiran & cadangan BLUD di subfolder lain tidak.

### 1.6 Internet keluar dari laptop

Unggahan butuh `www.googleapis.com` dan `oauth2.googleapis.com`. Kalau internet mati,
backup TETAP dibuat dan disimpan di `C:\apps\prima\backups-pending\`, lalu diunggah saat
backup berikutnya berjalan.

---

## 2. Uji skripnya dengan tangan dulu

Jangan memasang tugas sebelum skripnya terbukti jalan dengan tangan — kalau tidak,
kegagalan tugas dan kegagalan skrip tidak bisa dibedakan.

```powershell
cd C:\apps\prima
& 'C:\Program Files\nodejs\node.exe' scripts\backup-db.js
```

Hasil yang benar (tanggal/jam/ukuran berbeda):

```
2026-11-17T05:00:03.120Z [FOLDER] subfolder "01 Backup Database" dibuat di folder induk (1AbC…)
2026-11-17T05:00:09.842Z [DUMP-OK] prima-db-2026-11-17-12-00.sql.gz.enc (4685 KB)
2026-11-17T05:00:12.016Z [UPLOAD-OK] prima-db-2026-11-17-12-00.sql.gz.enc → Drive folder backup
2026-11-17T05:00:12.390Z [DONE] selesai 9.3s · retensi 30 · rotasi hapus 0
```

- Baris `[FOLDER]` hanya muncul sekali seumur hidup (saat subfolder pertama kali dibuat).
- **Nama berkas memakai jam WIB** (`…-12-00` = pukul 12.00), **jam di awal baris log
  memakai UTC** (berakhiran `Z`, jadi 12.00 WIB tertulis `05:00`). Backup yang dibuat
  sebelum 14 November 2026 masih bernama jam UTC.
- Buka Google Drive → folder induk → **01 Backup Database**: satu berkas
  `prima-db-….sql.gz.enc` harus ada.
- Baris terakhir `[SALINAN] lampiran N · lokal … · Drive …` = salinan kedua lampiran.
  **Jalan pertama** menyalin semua lampiran lama; kalau banyak, berhenti sesudah 40 menit
  ("tertunda N") dan dilanjutkan di jalan berikutnya — itu normal. Jalan sesudahnya hanya
  menyalin lampiran baru.

Kalau ada `[FATAL]`, `[UPLOAD-FAIL]`, atau `[FOLDER-FAIL]`, berhenti di sini dan lihat
[bagian 9](#9-membaca-kegagalan). Memasang tugas tidak akan memperbaiki apa pun.

---

## 3. Periksa tugas yang mungkin sudah ada

Server yang sudah berjalan lama kemungkinan **sudah punya** tugas backup — mungkin dengan
nama lain. Memasang lagi dengan nama berbeda menghasilkan **dua backup sehari** dan rotasi
yang menghabiskan jatah 30 berkas dua kali lebih cepat.

Buka PowerShell **sebagai Administrator** (klik kanan ikon PowerShell → *Run as
administrator*), lalu:

```powershell
Get-ScheduledTask | Where-Object { $_.Actions.Arguments -match 'backup-db' -or $_.Actions.Execute -match 'backup-db' } |
  ForEach-Object {
    $i = $_ | Get-ScheduledTaskInfo
    [pscustomobject]@{
      Nama        = $_.TaskName
      Status      = $_.State
      Program     = $_.Actions.Execute
      Argumen     = $_.Actions.Arguments
      Folder      = $_.Actions.WorkingDirectory
      Akun        = $_.Principal.UserId
      Terakhir    = $i.LastRunTime
      HasilAkhir  = $i.LastTaskResult
      Berikutnya  = $i.NextRunTime
    }
  } | Format-List
```

| Yang terlihat | Langkah |
|---|---|
| Tidak ada keluaran | belum ada tugas → lanjut bagian 4 |
| Ada satu tugas | pasang ulang dengan **nama yang sama** di bagian 4 (`-Force` menimpanya) — setelannya jadi seragam dengan panduan ini |
| Ada dua atau lebih | hapus yang lebih — `Unregister-ScheduledTask -TaskName '<nama>' -Confirm:$false` — sisakan satu |

**Pindah ke folder induk Drive tidak membutuhkan perubahan tugas apa pun.** Tugas tetap
memanggil `scripts\backup-db.js`; skrip itu sendiri yang membaca
`GOOGLE_DRIVE_FOLDER_ID_ROOT` dari `.env.local`.

---

## 4. Memasang tugas — cara cepat (PowerShell)

Di PowerShell **sebagai Administrator**. Sesuaikan dua baris pertama, lalu tempel
seluruhnya:

```powershell
$app  = 'C:\apps\prima'                          # folder aplikasi PRIMA
$node = 'C:\Program Files\nodejs\node.exe'       # hasil langkah 1.1

$aksi = New-ScheduledTaskAction -Execute $node -Argument 'scripts\backup-db.js' -WorkingDirectory $app
$jam  = New-ScheduledTaskTrigger -Daily -At 12:00
$atur = New-ScheduledTaskSettingsSet `
          -StartWhenAvailable `
          -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
          -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
          -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'PRIMA - backup database' `
  -Description 'Backup harian MySQL PRIMA -> Google Drive (scripts\backup-db.js). Panduan: docs\PANDUAN-jadwal-backup.md' `
  -Action $aksi -Trigger $jam -Settings $atur `
  -User 'SYSTEM' -RunLevel Highest -Force
```

Keluarannya satu baris berisi `PRIMA - backup database   Ready`. Arti tiap setelan ada
di [bagian 10](#10-kenapa-setelannya-begini).

Lanjut ke [bagian 6](#6-membuktikan-tugasnya-benar-benar-jalan) — **jangan berhenti di
sini**, tugas yang terdaftar belum tentu jalan.

---

## 5. Memasang tugas — cara klik (layar Task Scheduler)

Hasilnya sama persis dengan bagian 4; pilih salah satu saja. Nama menu ditulis dalam
bahasa Inggris (tampilan Windows bawaan) dengan padanan Indonesianya.

1. Tekan **Win + R**, ketik `taskschd.msc`, Enter. Jendela *Task Scheduler* terbuka.
2. Panel kanan → **Create Task…** (*Buat Tugas*). **Jangan** pilih *Create Basic Task* —
   wizard dasar tidak menampilkan setelan baterai dan "jalankan yang terlewat".

**Tab General (Umum)**

3. *Name*: `PRIMA - backup database`
4. *Description*: `Backup harian MySQL PRIMA ke Google Drive. Panduan: docs\PANDUAN-jadwal-backup.md`
5. *Security options* → klik **Change User or Group…** → ketik `SYSTEM` → **Check Names**
   → OK. Baris akun berubah jadi `NT AUTHORITY\SYSTEM`.
6. Centang **Run with highest privileges**.
7. *Configure for*: pilih Windows versi laptop ini (mis. *Windows 10* untuk Windows 10/11).

**Tab Triggers (Pemicu)**

8. **New…** → *Begin the task*: **On a schedule** → **Daily** → *Start*: hari ini, jam
   **12:00:00** → *Recur every*: `1` days.
9. Pastikan **Enabled** tercentang di bawah → OK.

**Tab Actions (Tindakan)**

10. **New…** → *Action*: **Start a program**.
11. *Program/script*: path lengkap Node dari langkah 1.1, mis.
    `C:\Program Files\nodejs\node.exe` (boleh pakai **Browse…**).
12. *Add arguments*: `scripts\backup-db.js`
13. *Start in*: `C:\apps\prima` — **tanpa tanda kutip**, walau foldernya berspasi (kolom
    ini menolak kutip dan tugas gagal dengan kode `0x8007010B`). → OK.

**Tab Conditions (Kondisi)**

14. **Hapus centang** *Start the task only if the computer is on AC power*. (Otomatis
    menonaktifkan *Stop if the computer switches to battery power* — biarkan tidak
    tercentang.)
15. Biarkan *Start only if the following network connection is available* **tidak**
    tercentang — tanpa internet backup tetap dibuat & diantrekan.
16. *Wake the computer to run this task*: tidak dicentang.

**Tab Settings (Pengaturan)**

17. Centang **Allow task to be run on demand**.
18. Centang **Run task as soon as possible after a scheduled start is missed**.
19. Centang **Stop the task if it runs longer than**: **1 hour**.
20. *If the task is already running…*: **Do not start a new instance**.
21. OK. Kalau diminta sandi Windows, itu tandanya akun di langkah 5 belum `SYSTEM` —
    ulangi langkah 5.

Tugas muncul di daftar *Task Scheduler Library*. Lanjut ke bagian 6.

---

## 6. Membuktikan tugasnya benar-benar jalan

Tiga bukti, dan **ketiganya** wajib — masing-masing menangkap kegagalan yang tidak
tertangkap yang lain.

### 6.1 Jalankan sekarang lewat penjadwal (bukan dengan tangan)

```powershell
Start-ScheduledTask -TaskName 'PRIMA - backup database'
Start-Sleep -Seconds 60
Get-ScheduledTaskInfo -TaskName 'PRIMA - backup database' |
  Select-Object LastRunTime, LastTaskResult, NextRunTime
```

`LastTaskResult` harus **0**. Angka lain → [bagian 9.2](#92-kode-hasil-task-scheduler).
Kalau masih `267009`, tugasnya belum selesai — tunggu sebentar lalu ulangi baris terakhir.

### 6.2 Log yang ditulis skripnya sendiri

```powershell
Get-Content C:\apps\prima\scripts\backup-db.log -Tail 6
```

Harus ada `[UPLOAD-OK]` dan `[DONE]` dengan jam yang baru saja. Log ini bukti terpenting:
`LastTaskResult` hanya membuktikan Node mau dijalankan, log membuktikan **backup-nya**
jadi. (Pelajaran dari pemasangan 2026-09-11: Task Scheduler bisa melaporkan jadwal yang
wajar padahal tugasnya tidak pernah dimulai — yang membongkarnya log.)

### 6.3 Berkasnya ada di Drive

Buka folder induk → **01 Backup Database** → berkas terbaru bertanggal hari ini, jamnya
sesuai jam backup (WIB).

### 6.3b Panel Admin

Kalau migrasi `migration-drive-arsip.sql` sudah dijalankan: **Admin Panel → Drive & Backup**
(khusus Super Admin) menampilkan backup tadi di "Backup database terbaru", lengkap dengan
ukuran dan sidik SHA-256-nya, dan baris "Backup database" di "Kesehatan per tujuan" berisi
jam barusan.

### 6.4 Uji "terlewat" (sekali saja, disarankan)

Ini yang membuktikan setelan *jalankan yang terlewat* benar-benar terpasang:

1. Ubah sementara jam tugas ke 5 menit dari sekarang:
   `Set-ScheduledTask -TaskName 'PRIMA - backup database' -Trigger (New-ScheduledTaskTrigger -Daily -At (Get-Date).AddMinutes(5))`
2. Matikan laptop (Shut down) sebelum jam itu, tunggu lewat jamnya, nyalakan lagi, login.
3. Dalam ±10 menit sesudah menyala, `scripts\backup-db.log` harus mendapat baris baru.
4. Kembalikan jamnya:
   `Set-ScheduledTask -TaskName 'PRIMA - backup database' -Trigger (New-ScheduledTaskTrigger -Daily -At 12:00)`

---

## 7. Pemeriksaan rutin (cukup sebulan sekali)

Cara termudah: **Admin Panel → Drive & Backup**. Kalau backup hari ini belum naik
padahal sudah lewat pukul 14.00 dan aplikasi menyala sejak pagi, muncul spanduk kuning;
kalau backup terakhir lebih dari 4 hari lalu, spanduk merah. Tekan **UJI SEKARANG** untuk
memastikan sambungan ke Drive & berkas lama masih terbaca.

Lewat PowerShell — satu perintah, tiga jawaban:

```powershell
$i = Get-ScheduledTaskInfo -TaskName 'PRIMA - backup database'
"Terakhir jalan : $($i.LastRunTime)   hasil: $($i.LastTaskResult)"
"Berikutnya     : $($i.NextRunTime)"
Get-Content C:\apps\prima\scripts\backup-db.log -Tail 200 | Select-String 'UPLOAD-OK' | Select-Object -Last 5
Get-ChildItem C:\apps\prima\backups-pending -Filter *.enc -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
```

| Tanda bahaya | Artinya |
|---|---|
| `UPLOAD-OK` terakhir lebih dari 3 hari kerja lalu | backup berhenti — lihat bagian 9 |
| `backups-pending` berisi berkas lebih tua dari kemarin | unggahan gagal terus (token/internet) |
| `hasil` bukan 0 | lihat bagian 9.2 |

Dan **setiap 6 bulan**: uji restore satu berkas ke database percobaan
(`docs/BACKUP-RESTORE.md` §Uji restore berkala). Backup yang tidak pernah dicoba
dipulihkan belum tentu backup.

---

## 8. Mengubah, mematikan sementara, menghapus

| Keperluan | Perintah (PowerShell Administrator) |
|---|---|
| Ganti jam (mis. 15:00) | `Set-ScheduledTask -TaskName 'PRIMA - backup database' -Trigger (New-ScheduledTaskTrigger -Daily -At 15:00)` |
| Matikan sementara | `Disable-ScheduledTask -TaskName 'PRIMA - backup database'` |
| Hidupkan lagi | `Enable-ScheduledTask -TaskName 'PRIMA - backup database'` |
| Backup sekarang juga | `Start-ScheduledTask -TaskName 'PRIMA - backup database'` |
| Hapus tugas | `Unregister-ScheduledTask -TaskName 'PRIMA - backup database' -Confirm:$false` |
| Folder aplikasi pindah | ulangi bagian 4 dengan `$app` baru (nama sama → ditimpa) |
| Node di-upgrade ke folder lain | ulangi bagian 4 dengan `$node` baru |

⚠️ Mengubah setelan lewat `Set-ScheduledTask -Settings (New-ScheduledTaskSettingsSet …)`
**mengganti seluruh** setelan — `-StartWhenAvailable` dan izin baterai yang tidak ikut
ditulis ikut hilang diam-diam. Untuk mengubah setelan, ulangi bagian 4 utuh.

**Sebelum memperbarui aplikasi** (`git pull` + build), menjalankan backup manual lebih
dulu adalah kebiasaan baik: `Start-ScheduledTask -TaskName 'PRIMA - backup database'`,
tunggu `UPLOAD-OK` di log, baru perbarui.

---

## 9. Membaca kegagalan

### 9.1 Baris di `scripts\backup-db.log`

| Baris | Penyebab umum | Yang dilakukan |
|---|---|---|
| `[FATAL] .env.local tidak ditemukan` | tugas menunjuk salinan `backup-db.js` di luar folder aplikasi (skrip mencari `.env.local` satu folder di atas dirinya, bukan di *Start in*) | periksa *Argumen* & *Folder* tugas (bagian 3) |
| `[FATAL] env BACKUP_ENC_PASSWORD kosong/terlalu pendek` | baris belum diisi / < 16 karakter | isi `.env.local` (langkah 1.3) |
| `[FATAL] env MYSQL_USER kosong` (atau `_DATABASE`, `GOOGLE_OAUTH_…`) | baris belum diisi | isi `.env.local` |
| `[FATAL] mysqldump tidak bisa dijalankan (ENOENT)` | `MYSQLDUMP_PATH` kosong/salah | langkah 1.2 |
| `[FATAL] mysqldump exit 2: … Can't connect` | MySQL/Laragon mati saat jam backup | nyalakan Laragon lebih awal, atau geser jam (bagian 8) |
| `[FATAL] mysqldump exit 2: … Access denied` | `MYSQL_USER`/`MYSQL_PASSWORD` salah | samakan dengan yang dipakai aplikasi |
| `[FOLDER-FAIL] … File not found` | `GOOGLE_DRIVE_FOLDER_ID_ROOT` salah ketik, atau folder itu tidak bisa ditulis akun token | periksa ID (ujung URL `…/folders/<ID>`) dan pembagian folder (1.5). Dump tetap dibuat & menunggu di `backups-pending` |
| `[UPLOAD-FAIL] … getaddrinfo ENOTFOUND` / `ETIMEDOUT` | internet mati | tidak perlu apa-apa: berkas di `backups-pending`, terunggah otomatis di backup berikutnya |
| `[UPLOAD-FAIL]` / `[RETRY-FAIL]` dengan `invalid_grant` | refresh token dicabut, kedaluwarsa, atau sandi akun Google diganti | buat ulang `GOOGLE_OAUTH_REFRESH_TOKEN` (`docs/BACKUP-RESTORE.md` §Pemegang akun) |
| `[UPLOAD-FAIL] … storageQuotaExceeded` | Drive penuh | kosongkan Drive atau turunkan `BACKUP_RETENTION` |
| `[ROTATE-FAIL]` | gagal menghapus backup lama (jarang) | backup hari itu tetap aman; periksa lagi besok |
| `[SALINAN] … gagal N` | sebagian lampiran tidak tersalin (internet putus di tengah) | tidak perlu apa-apa — dicoba lagi besok. Ringkasannya di panel Drive & Backup |
| `[SALINAN] … hilang N` | lampiran sudah dihapus dari Drive sebelum sempat disalin | tidak bisa dipulihkan; tidak akan dicoba lagi secara berarti |
| `[SALINAN-FAIL]` | salinan berhenti total (mis. database tak terbaca) | backup database tetap sah; periksa pesannya |
| `[LEWAT] backup lain sedang berjalan` | backup manual & terjadwal berbarengan | tidak perlu apa-apa. Kalau muncul terus padahal tidak ada backup lain, hapus `backups-pending\.lock` (kunci dianggap basi sendiri sesudah 2 jam) |
| `[CATAT-FAIL] … drive_health/drive_arsip doesn't exist` | migrasi `migration-drive-arsip.sql` belum dijalankan | backup tetap jalan; jalankan migrasinya supaya panel Admin terisi dan rotasi memakai catatan |
| log **tidak bertambah sama sekali** | tugas tidak pernah dimulai | bagian 9.2 + periksa setelan baterai (bagian 10) |

### 9.2 Kode hasil Task Scheduler

| `LastTaskResult` | Arti |
|---|---|
| `0` | selesai tanpa galat |
| `1` | skripnya jalan tapi gagal (`FATAL`, `UPLOAD-FAIL`, atau `FOLDER-FAIL`) → baca log |
| `267009` (`0x41301`) | sedang berjalan |
| `267011` (`0x41303`) | belum pernah jalan sejak dipasang |
| `2147942402` (`0x80070002`) | program tidak ditemukan — path Node di *Program/script* salah |
| `2147942667` (`0x8007010B`) | folder *Start in* tidak ada, atau ditulis dengan tanda kutip |
| `2147943726` (`0x8007052E`) | akun/sandi salah — tugas tidak dipasang sebagai `SYSTEM` |
| `2147946720` (`0x800710E0`) | ditolak penjadwal — biasanya karena aturan baterai; lihat bagian 10 |

---

## 10. Kenapa setelannya begini

| Setelan | Alasan |
|---|---|
| **Jam 12:00**, bukan dini hari | laptop server mati tiap malam. Jadwal 01:00 baru jalan saat laptop dinyalakan pagi — persis saat MySQL/Laragon mungkin belum siap, sehingga backup gagal dan tidak diulang. Siang hari MySQL sudah pasti hidup. `mysqldump --single-transaction` tidak mengunci tabel, jadi backup di jam kerja tidak mengganggu pemakai |
| **`-StartWhenAvailable`** (*run as soon as possible after a scheduled start is missed*) | kalau laptop mati atau tidur tepat jam 12:00, backup menyusul begitu laptop hidup lagi, bukan dibuang. Tanpa ini, hari yang terlewat = hari tanpa backup, tanpa pesan apa pun |
| **`-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`** | bawaan Windows menolak memulai tugas saat laptop memakai baterai — **tanpa log, tanpa pesan**. Di laptop yang kabelnya sesekali dicabut, backup berhenti diam-diam |
| **`SYSTEM` + *highest privileges*** | jalan walau tidak ada yang login, tidak menyimpan sandi Windows siapa pun, tidak ikut mati saat orangnya logout atau sandinya diganti, dan tidak memunculkan jendela hitam di layar. Sama dengan tugas cron PRIMA lain (`PANDUAN-pemasangan-windows.md` §5) |
| **Path lengkap Node + `MYSQLDUMP_PATH`** | `SYSTEM` membaca PATH mesin, bukan PATH akun Anda. Node yang dipasang per-akun (nvm) atau `mysqldump` Laragon tidak terlihat olehnya |
| **`WorkingDirectory` = folder aplikasi** | argumennya relatif (`scripts\backup-db.js`), jadi harus dijalankan dari folder aplikasi. `.env.local`, `backups-pending\`, dan log sendiri dicari dari letak skrip, bukan dari folder ini |
| **Batas 1 jam** | backup normal selesai dalam hitungan detik–menit; salinan lampiran sendiri berhenti di 40 menit dan melanjutkan besok, jadi batas ini tidak memotongnya di tengah. Tugas yang menggantung (jaringan setengah putus) dihentikan supaya hari berikutnya tidak tertahan |
| **`IgnoreNew`** (*do not start a new instance*) | dua backup bersamaan saling menghapus saat rotasi. Kalau tugas sebelumnya belum selesai, yang baru dilewati |
| **Tidak mensyaratkan jaringan** | tanpa internet, dump tetap dibuat dan menunggu di `backups-pending\`; backup terlambat naik lebih baik daripada tidak ada |
| **Sekali sehari** | `BACKUP_RETENTION` menghitung **berkas**, bukan hari: 30 berkas = 30 hari kalau sehari sekali, 15 hari kalau dua kali. Menambah jadwal kedua memendekkan jangkauan mundur |

Yang **tidak** dilindungi backup harian: perubahan antara dua backup. Untuk itu ada
binary log MySQL (`docs/BACKUP-RESTORE.md` §Lapis 2).
