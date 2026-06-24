-- ═══ MIGRATION 018 — Master Akun (BLUD) ═══════════════════════════════════════
-- Tabel master daftar kode rekening + uraian untuk modul BLUD.
-- Dipakai sebagai source-of-truth dropdown rekening di DPA & Pergeseran (nanti).
--
-- Idempotent: pakai IF NOT EXISTS supaya bisa di-run ulang aman.
-- Schema: id, kode (string, e.g. "510199"), uraian (string).
--
-- Apply via: mysql -u <user> -p <db> < docs/migrations/migration-018-master-akun.sql

CREATE TABLE IF NOT EXISTS master_akun (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kode        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT 'Kode rekening, e.g. "510199"',
  uraian      VARCHAR(255)  NOT NULL            COMMENT 'Nama akun, e.g. "Belanja Pegawai BLUD"',
  urutan      INT UNSIGNED  NOT NULL DEFAULT 0  COMMENT 'Urutan tampil di UI',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kode   (kode),
  INDEX idx_uraian (uraian(64)),
  INDEX idx_urutan (urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Master daftar kode rekening + uraian';
