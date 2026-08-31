-- migration-blud-riwayat-drive.sql
-- Tahap 1 CONCEPT-blud-cadangan-json.md — penanda "foto ini sudah naik ke Drive".
--
-- Cermin `lkjip_versi.drive_file_id` yang sudah ada. Gunanya dua:
--   1. menjawab "mana yang belum diunggah" dengan `WHERE drive_file_id IS NULL`,
--      tanpa perlu melisting isi folder Drive tiap kali cadangan berjalan;
--   2. mencatat KE MANA tiap foto pergi, jadi berkas di Drive bisa ditelusuri
--      balik ke barisnya.
--
-- NULL = belum pernah diunggah (juga berlaku untuk seluruh baris lama).
-- Tidak diberi index: tabelnya dipangkas di angka 50 per (jenis, tahun, versi),
-- jadi pemindaian penuhnya murah dan index hanya menambah beban tulis di jalur
-- Simpan yang justru paling ramai.

ALTER TABLE blud_riwayat_simpan
  ADD COLUMN drive_file_id VARCHAR(64) NULL
  COMMENT 'Id berkas Google Drive hasil pencadangan JSON. NULL = belum diunggah.';
