-- Migration: tambah kolom program_ref di kinerja_master
-- Tujuan: menghubungkan kegiatan (tipe='kegiatan') ke program induknya
-- Kolom ini hanya diisi saat tipe='kegiatan', NULL untuk tipe lain
-- MySQL syntax

ALTER TABLE kinerja_master
  ADD COLUMN program_ref VARCHAR(255) DEFAULT NULL AFTER nama;

CREATE INDEX idx_km_program_ref ON kinerja_master (program_ref);
