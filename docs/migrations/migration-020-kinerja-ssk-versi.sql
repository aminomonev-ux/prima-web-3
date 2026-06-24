-- migration-020-kinerja-ssk-versi.sql
-- Tahap Versi E-Anggaran — Checkpoint A Task #8
-- Tambah kolom versi (MURNI/PERUBAHAN) di kinerja_ssk.
-- Additive only — JANGAN drop apapun di migration ini.
-- Reference: docs/lain/KINERJA_VERSI_REFACTOR.md

-- ─── 1. ADD COLUMNS ─────────────────────────────────────────────────────────
ALTER TABLE kinerja_ssk
  ADD COLUMN versi_tipe ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI' AFTER sumber,
  ADD COLUMN versi_seq TINYINT NOT NULL DEFAULT 0 AFTER versi_tipe,
  ADD COLUMN canonical_id VARCHAR(20) NOT NULL DEFAULT '' AFTER versi_seq,
  ADD COLUMN parent_versi_id INT NULL AFTER canonical_id,
  ADD COLUMN locked_at DATETIME NULL AFTER parent_versi_id,
  ADD COLUMN is_nullified BOOLEAN NOT NULL DEFAULT FALSE AFTER locked_at;

-- ─── 2. INDEX untuk lookup cepat ────────────────────────────────────────────
CREATE INDEX idx_ks_versi      ON kinerja_ssk (tahun, sumber, versi_tipe, versi_seq);
CREATE INDEX idx_ks_canonical  ON kinerja_ssk (canonical_id);

-- ─── 3. FK self (parent versi) ──────────────────────────────────────────────
ALTER TABLE kinerja_ssk
  ADD CONSTRAINT fk_ks_parent_versi
  FOREIGN KEY (parent_versi_id) REFERENCES kinerja_ssk(id) ON DELETE SET NULL;

-- ─── 4. CATATAN ─────────────────────────────────────────────────────────────
-- UNIQUE KEY (tahun, sumber, canonical_id, versi_tipe, versi_seq) BELUM ditambah karena
-- canonical_id masih '' untuk semua row sampai backfill (migration-022). Tambah unique
-- key dilakukan SETELAH backfill selesai.
--
-- Default versi_tipe='MURNI' + versi_seq=0 memastikan data lama otomatis dianggap
-- versi MURNI tanpa perlu UPDATE manual.
