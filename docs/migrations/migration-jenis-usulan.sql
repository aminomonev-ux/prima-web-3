-- Migration: Tambah kolom jenis_usulan di usulan_headers
-- MySQL 8 syntax (tanpa IF NOT EXISTS pada ADD COLUMN)
-- Jalankan sekali di production DB

ALTER TABLE usulan_headers
  ADD COLUMN jenis_usulan ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI'
  AFTER tahun_anggaran;
