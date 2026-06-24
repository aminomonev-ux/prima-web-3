-- Migration: rename kolom keterangan → jenis_belanja (modul Usulan Kebutuhan)
-- Konteks: label UI "Keterangan Pengajuan" diganti "Jenis Belanja" (2026-06-10),
-- kolom DB di-rename agar konsisten. Data tidak berubah, hanya nama kolom.
-- Catatan: kolom `keterangan` di tabel lain (dpa_blud, pergeseran_dpa, dll) TIDAK disentuh.

ALTER TABLE usulan_headers CHANGE COLUMN keterangan jenis_belanja TEXT DEFAULT NULL;
ALTER TABLE usulan_items   CHANGE COLUMN keterangan jenis_belanja TEXT DEFAULT NULL;
