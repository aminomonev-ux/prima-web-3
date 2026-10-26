-- Migration: Buku Besar Aset — kondisi eksisting per barang × lokasi (Tahap 3)
-- Konsep: docs/CONCEPT-bba-perencanaan.md §6 (dieksekusi 2026-10-26).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang, dan SESUDAH
-- migration-bba-barang-proses.sql (FK ke bba_barang): tampilan Per Barang membaca bba_eksisting.
-- Aman untuk data lama: tabel baru, kosong. Tiap pendataan = baris baru (riwayat); yang berlaku =
-- terbaru per barang × lokasi. Pendataan ulang di tanggal yang SAMA menimpa (koreksi salah ketik).
-- digabung_dari/digabung_pada diisi saat Gabungkan barang memindahkan pendataan — dipakai untuk
-- menandai "perlu didata ulang" bila satu lokasi punya pendataan dari dua barang.
-- Barang/lokasi yang masih punya pendataan tidak bisa dihapus (FK RESTRICT).
-- Jalankan di database MySQL 8.4 PRIMA.

CREATE TABLE IF NOT EXISTS bba_lokasi (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama       VARCHAR(160) NOT NULL,
  urutan     INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_lokasi_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — master lokasi/ruangan pendataan eksisting';

CREATE TABLE IF NOT EXISTS bba_eksisting (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  barang_id     INT UNSIGNED NOT NULL,
  lokasi_id     INT UNSIGNED NOT NULL,
  baik          INT UNSIGNED NOT NULL DEFAULT 0,
  rusak_ringan  INT UNSIGNED NOT NULL DEFAULT 0,
  rusak_berat   INT UNSIGNED NOT NULL DEFAULT 0,
  tgl_cek       DATE         NOT NULL,
  catatan       VARCHAR(500) NULL,
  file_id       VARCHAR(64)  NULL COMMENT 'Soft-FK uploaded_files.file_id (context buku_besar_aset) — foto pendataan',
  digabung_dari VARCHAR(160) NULL COMMENT 'Nama barang asal bila baris ini dipindah oleh Gabungkan barang',
  digabung_pada DATETIME     NULL,
  created_by    INT          NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_be_cek (barang_id, lokasi_id, tgl_cek),
  KEY idx_be_lokasi (lokasi_id, tgl_cek),
  CONSTRAINT fk_be_barang FOREIGN KEY (barang_id)  REFERENCES bba_barang(id) ON DELETE RESTRICT,
  CONSTRAINT fk_be_lokasi FOREIGN KEY (lokasi_id)  REFERENCES bba_lokasi(id) ON DELETE RESTRICT,
  CONSTRAINT fk_be_user   FOREIGN KEY (created_by) REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — pendataan kondisi eksisting (riwayat; yang berlaku = terbaru per barang × lokasi)';
