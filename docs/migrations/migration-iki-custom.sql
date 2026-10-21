-- Migration: IKI — varian CUSTOM (tabel bagian II dirancang sendiri) + templat tabel
-- Konsep: docs/CONCEPT-iki-custom.md (keputusan pemilik 2026-10-21).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: tanpa kolom `tabel_custom`
-- daftar & detail IKI gagal (SELECT menyebutnya), dan Buat IKI varian CUSTOM ditolak MySQL.
-- Aman untuk data lama: STANDAR/DIREKTUR tidak berubah, `tabel_custom` NULL bagi mereka.
-- Jalankan di database MySQL 8.4 PRIMA.

ALTER TABLE iki_dokumen
  MODIFY COLUMN varian ENUM('STANDAR','DIREKTUR','CUSTOM') NOT NULL DEFAULT 'STANDAR',
  ADD COLUMN tabel_custom JSON NULL COMMENT 'Varian CUSTOM: bentuk + isi tabel bagian II (lib/iki/custom.ts TabelCustom); NULL untuk STANDAR/DIREKTUR' AFTER jenis,
  ADD COLUMN templat_id INT NULL COMMENT 'Soft-FK iki_templat — jejak asal saja, isinya sudah DISALIN saat dokumen dibuat' AFTER tabel_custom;

CREATE TABLE IF NOT EXISTS iki_templat (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nama        VARCHAR(150) NOT NULL,
  payload     JSON NOT NULL COMMENT 'TabelCustom (lib/iki/custom.ts) — bentuk tabel; disalin ke dokumen, tidak dirujuk',
  created_by  INT NULL,
  updated_by  INT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iki_templat_nama (nama),
  CONSTRAINT fk_iki_templat_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_iki_templat_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='IKI - templat tabel varian CUSTOM (migration-iki-custom.sql)';
