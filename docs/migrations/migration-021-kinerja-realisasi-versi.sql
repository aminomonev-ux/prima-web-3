-- migration-021-kinerja-realisasi-versi.sql
-- Tahap Versi E-Anggaran — Checkpoint A Task #9
-- Tambah pointer ssk_canonical_id + ssk_versi di kinerja_realisasi.
-- Additive only — JANGAN drop kolom turunan di sini (itu Checkpoint D task #14).
-- Reference: docs/lain/KINERJA_VERSI_REFACTOR.md

ALTER TABLE kinerja_realisasi
  ADD COLUMN ssk_canonical_id VARCHAR(20)                NOT NULL DEFAULT '' AFTER bulan,
  ADD COLUMN ssk_versi_tipe   ENUM('MURNI','PERUBAHAN')  NOT NULL DEFAULT 'MURNI' AFTER ssk_canonical_id,
  ADD COLUMN ssk_versi_seq    TINYINT                    NOT NULL DEFAULT 0 AFTER ssk_versi_tipe;

CREATE INDEX idx_kr_canonical ON kinerja_realisasi (ssk_canonical_id);
CREATE INDEX idx_kr_versi     ON kinerja_realisasi (tahun, sumber, ssk_versi_tipe, ssk_versi_seq);

-- CATATAN:
-- Default 'MURNI seq=0' memastikan data lama otomatis dianggap mengacu ke versi MURNI.
-- Backfill ssk_canonical_id (link ke kinerja_ssk.canonical_id) dilakukan di
-- migration-022 setelah SSK punya canonical_id terisi.
