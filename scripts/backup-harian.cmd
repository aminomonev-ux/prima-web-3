@echo off
REM scripts/backup-harian.cmd — pembungkus untuk Windows Task Scheduler.
REM
REM Kenapa perlu pembungkus: `schtasks` tidak punya opsi "Start in", sedangkan
REM `backup-db.js` membaca `.env.local` dari direktori kerja. Tanpa baris `cd`
REM di bawah, tugas terjadwalnya jalan dari C:\Windows\System32, tidak menemukan
REM env-nya, dan gagal diam-diam — persis jenis kegagalan yang paling sulit
REM disadari.
REM
REM `%~dp0` = folder berkas ini, jadi `..` selalu akar proyek di mana pun ia
REM dipasang. Tidak ada path yang dipatri.
REM
REM Pasang (PowerShell, sekali saja):
REM   schtasks /Create /TN "PRIMA Backup DB" /SC DAILY /ST 01:00 ^
REM     /TR "%~dp0backup-harian.cmd"
REM
REM Hasilnya dicatat ke scripts\backup-db.log — baris UPLOAD-OK berarti berhasil.

cd /d "%~dp0.."
node scripts\backup-db.js
