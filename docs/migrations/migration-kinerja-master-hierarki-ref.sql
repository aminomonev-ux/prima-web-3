-- Migration: tambah kolom kegiatan_ref dan subkegiatan_ref di kinerja_master
-- Hierarki: Program → Kegiatan (program_ref) → Sub Kegiatan (program_ref + kegiatan_ref) → Uraian SSK (program_ref + kegiatan_ref + subkegiatan_ref)
-- MySQL syntax

ALTER TABLE kinerja_master
  ADD COLUMN kegiatan_ref VARCHAR(255) DEFAULT NULL AFTER program_ref;

ALTER TABLE kinerja_master
  ADD COLUMN subkegiatan_ref VARCHAR(255) DEFAULT NULL AFTER kegiatan_ref;

CREATE INDEX idx_km_kegiatan_ref    ON kinerja_master (kegiatan_ref);
CREATE INDEX idx_km_subkegiatan_ref ON kinerja_master (subkegiatan_ref);
