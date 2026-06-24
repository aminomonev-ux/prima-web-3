-- migration-bba-kategori-master.sql
-- Master Kategori Aset (BBA) — dropdown kategori_aset di form + halaman Master.
-- MySQL 8.4. Jalankan sekali.

CREATE TABLE bba_kategori_aset (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama       VARCHAR(128) NOT NULL,
  urutan     INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_kategori_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Master kategori aset (BBA) — sumber dropdown kategori_aset';

-- Seed 6 kategori standar belanja modal (INSERT IGNORE → idempotent).
INSERT IGNORE INTO bba_kategori_aset (nama, urutan) VALUES
  ('TANAH', 1),
  ('PERALATAN DAN MESIN', 2),
  ('GEDUNG DAN BANGUNAN', 3),
  ('JALAN, IRIGASI, DAN JARINGAN', 4),
  ('KONSTRUKSI DALAM PENGERJAAN (KDP)', 5),
  ('ALKES & ALDOK', 6);
