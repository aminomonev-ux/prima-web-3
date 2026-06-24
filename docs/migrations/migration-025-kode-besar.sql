-- ═══ MIGRATION 025 — Kode Besar (BLUD) ═══════════════════════════════════════
-- Tabel daftar kode rekening "besar" (high-level category) untuk modul BLUD.
-- Berbeda dengan master_akun (yang detail per kode rekening), kode_besar
-- berisi kategori belanja level tinggi (e.g. "5.X Belanja Daerah", "5.1 Belanja
-- Operasi BLUD", "5.2 Belanja Modal", dst).
--
-- Pattern: sama dengan master_akun — replace-all per save (DELETE + bulkInsert
-- via withTransaction). Atomic + idempotent.
--
-- Idempotent: pakai IF NOT EXISTS supaya bisa di-run ulang aman.
-- INSERT IGNORE pada seed → kalau row sudah ada (idx_kode), skip.
--
-- Apply via: mysql -u <user> -p <db> < docs/migrations/migration-025-kode-besar.sql

CREATE TABLE IF NOT EXISTS kode_besar (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kode        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT 'Kode rekening besar, e.g. "5.X" / "5.1" / "5.1.1"',
  uraian      VARCHAR(255)  NOT NULL            COMMENT 'Uraian, e.g. "Belanja Daerah"',
  urutan      INT UNSIGNED  NOT NULL DEFAULT 0  COMMENT 'Urutan tampil di UI',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kode (kode),
  INDEX idx_uraian (uraian(64)),
  INDEX idx_urutan (urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Daftar Kode Besar (kategori belanja level tinggi)';

-- ── Seed default 8 baris (idempotent via INSERT IGNORE) ──────────────────────
-- Data sesuai standar BLUD RSJD Dr. Amino Gondohutomo (referensi gambar user).
INSERT IGNORE INTO kode_besar (kode, uraian, urutan) VALUES
  ('5.X',   'Belanja Daerah',                       0),
  ('5.1',   'Belanja Operasi BLUD',                 1),
  ('5.2',   'Belanja Modal',                        2),
  ('5.1.1', 'Belanja Pegawai',                      3),
  ('5.1.2', 'Belanja Barang dan Jasa',              4),
  ('5.2.2', 'Belanja Modal Peralatan dan Mesin',    5),
  ('5.2.3', 'Belanja Modal Gedung dan Bangunan',    6),
  ('5.2.6', 'Belanja Modal Aset Lainnya',           7);
