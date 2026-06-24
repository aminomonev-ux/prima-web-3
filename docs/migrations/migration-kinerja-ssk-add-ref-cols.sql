-- Migration: Tambah kolom program, kegiatan, subkegiatan ke kinerja_ssk
-- Kolom ini diisi saat Inject Rekening dari menu RKO

ALTER TABLE kinerja_ssk
  ADD COLUMN program     VARCHAR(255) DEFAULT NULL COMMENT 'Diisi otomatis dari Inject Rekening' AFTER uraian,
  ADD COLUMN kegiatan    VARCHAR(255) DEFAULT NULL AFTER program,
  ADD COLUMN subkegiatan VARCHAR(255) DEFAULT NULL AFTER kegiatan;
