-- migration-blud-tahun-anggaran.sql
-- Tambah dimensi Tahun Anggaran ke versi DPA & Pergeseran BLUD.
-- Konsep: docs/CONCEPT-blud-tahun-anggaran.md (Opsi B).
-- Versi lama AMAN: backfill tahun_anggaran = YEAR(versi_tanggal).
-- Identitas versi: (versi_tanggal) -> (tahun_anggaran, versi_tanggal).
-- MySQL 8.4 — TANPA IF NOT EXISTS pada ADD COLUMN (aturan CLAUDE.md).

-- 1) dpa_blud
ALTER TABLE dpa_blud
  ADD COLUMN tahun_anggaran SMALLINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Tahun anggaran versi DPA (dimensi di atas versi_tanggal)' AFTER id;
UPDATE dpa_blud SET tahun_anggaran = YEAR(versi_tanggal) WHERE tahun_anggaran = 0;
ALTER TABLE dpa_blud ADD INDEX idx_tahun_versi (tahun_anggaran, versi_tanggal);

-- 2) pergeseran_dpa
ALTER TABLE pergeseran_dpa
  ADD COLUMN tahun_anggaran SMALLINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Tahun anggaran versi pergeseran' AFTER id;
UPDATE pergeseran_dpa SET tahun_anggaran = YEAR(versi_tanggal) WHERE tahun_anggaran = 0;
ALTER TABLE pergeseran_dpa ADD INDEX idx_tahun_versi (tahun_anggaran, versi_tanggal);

-- 3) rekap_pk (snapshot Cetak — ikut tahun agar hapus/scoping benar)
ALTER TABLE rekap_pk
  ADD COLUMN tahun_anggaran SMALLINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Tahun anggaran DPA yang di-rekap' AFTER versi_dpa;
UPDATE rekap_pk SET tahun_anggaran = YEAR(versi_dpa) WHERE tahun_anggaran = 0;
ALTER TABLE rekap_pk ADD INDEX idx_tahun_versi (tahun_anggaran, versi_dpa);

-- 4) View history — sertakan tahun_anggaran
CREATE OR REPLACE VIEW v_dpa_history AS
  SELECT tahun_anggaran, versi_tanggal, COUNT(*) AS jumlah_baris
  FROM dpa_blud
  GROUP BY tahun_anggaran, versi_tanggal
  ORDER BY tahun_anggaran DESC, versi_tanggal DESC;

CREATE OR REPLACE VIEW v_pergeseran_history AS
  SELECT tahun_anggaran, versi_tanggal, dpa_versi_tanggal, COUNT(*) AS jumlah_baris
  FROM pergeseran_dpa
  GROUP BY tahun_anggaran, versi_tanggal, dpa_versi_tanggal
  ORDER BY tahun_anggaran DESC, versi_tanggal DESC;

-- 5) Migrasi key blud_locks per-versi: sisipkan tahun (pertahankan counter versi)
--    key lama berformat 'YYYY-MM-DD' -> jadi 'YYYY:YYYY-MM-DD'
UPDATE blud_locks
  SET key_id = CONCAT(YEAR(key_id), ':', key_id)
  WHERE entity IN ('dpa_blud','pergeseran_dpa','rekap_pk')
    AND key_id REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
