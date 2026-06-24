-- ═══ MIGRATION 026 — Kode Besar: tambah kolom level + parent_kode ════════════
-- Untuk fitur: saat klik 'Form Baru' di DPA, baris awal di-inject otomatis
-- dari menu Kode Besar (replace hardcoded skeleton lama).
--
-- Kolom baru:
-- - level       : 'L1' | 'L2' | 'L2.1' — menentukan tipe_baris di DPA
--                  L1   → GRANDMASTER (TOTAL row, root)
--                  L2   → MASTER (kelompok belanja)
--                  L2.1 → CHILD (leaf, bisa input vol/harga)
-- - parent_kode : ref ke kode_besar.kode (nullable)
--                  Hanya WAJIB untuk row L2.1 (parent L2 mana yang dia ikuti).
--                  L1: NULL (root). L2: auto-detect by segmen pertama match L1.
--
-- Idempotent: ADD COLUMN dibungkus IF NOT EXISTS via stored procedure
-- (MySQL 8 tidak support ADD COLUMN IF NOT EXISTS langsung).
--
-- Apply via: mysql -u <user> -p <db> < docs/migrations/migration-026-kode-besar-level.sql

DELIMITER //

DROP PROCEDURE IF EXISTS migration_026_kode_besar_add_cols //

CREATE PROCEDURE migration_026_kode_besar_add_cols()
BEGIN
  -- Cek kolom `level` sudah ada?
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'kode_besar'
      AND COLUMN_NAME  = 'level'
  ) THEN
    ALTER TABLE kode_besar
      ADD COLUMN level VARCHAR(8) NOT NULL DEFAULT 'L2'
        COMMENT 'L1 | L2 | L2.1 — menentukan tipe_baris saat inject ke DPA'
        AFTER uraian;
  END IF;

  -- Cek kolom `parent_kode` sudah ada?
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'kode_besar'
      AND COLUMN_NAME  = 'parent_kode'
  ) THEN
    ALTER TABLE kode_besar
      ADD COLUMN parent_kode VARCHAR(64) NULL
        COMMENT 'Ref ke kode_besar.kode — wajib untuk L2.1, NULL untuk L1, auto untuk L2'
        AFTER level,
      ADD INDEX idx_parent_kode (parent_kode);
  END IF;
END //

DELIMITER ;

CALL migration_026_kode_besar_add_cols();
DROP PROCEDURE migration_026_kode_besar_add_cols;

-- ── Update seed default (8 baris dari migration 025) — set level + parent_kode ──
-- Idempotent: hanya update kalau level masih default 'L2' (artinya belum di-set).
-- Pakai WHERE kode IN (...) supaya tidak overwrite data user yang sudah diisi manual.

UPDATE kode_besar SET level = 'L1',   parent_kode = NULL   WHERE kode = '5.X'   AND level = 'L2';
UPDATE kode_besar SET level = 'L2',   parent_kode = NULL   WHERE kode = '5.1'   AND parent_kode IS NULL;
UPDATE kode_besar SET level = 'L2',   parent_kode = NULL   WHERE kode = '5.2'   AND parent_kode IS NULL;
UPDATE kode_besar SET level = 'L2.1', parent_kode = '5.1'  WHERE kode = '5.1.1' AND parent_kode IS NULL;
UPDATE kode_besar SET level = 'L2.1', parent_kode = '5.1'  WHERE kode = '5.1.2' AND parent_kode IS NULL;
UPDATE kode_besar SET level = 'L2.1', parent_kode = '5.2'  WHERE kode = '5.2.2' AND parent_kode IS NULL;
UPDATE kode_besar SET level = 'L2.1', parent_kode = '5.2'  WHERE kode = '5.2.3' AND parent_kode IS NULL;
UPDATE kode_besar SET level = 'L2.1', parent_kode = '5.2'  WHERE kode = '5.2.6' AND parent_kode IS NULL;
