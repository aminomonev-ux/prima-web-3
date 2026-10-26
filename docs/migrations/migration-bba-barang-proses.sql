-- Migration: Buku Besar Aset — Master Barang + status Dalam Proses (Tahap 2)
-- Konsep: docs/CONCEPT-bba-perencanaan.md §5 (dieksekusi 2026-10-26).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: daftar BBA membaca
-- buku_besar_aset.barang_id & tgl_proses dan menulis status DIPROSES, jadi tanpa kolomnya
-- layar Buku Besar Aset gagal dimuat.
-- Aman untuk data lama: item yang sudah ada hanya belum tertaut barang (barang_id NULL) —
-- ditautkan lewat spanduk "N item belum ditautkan" di tampilan Per Barang. Status lama tidak berubah.
-- Barang yang masih dipakai item tidak bisa dihapus (FK RESTRICT); gabungkan dulu di Master → Barang.
-- Kolasi nama mengikuti bawaan utf8mb4 (0900_ai_ci): "Laptop" dan "laptop" dianggap kembar.
-- Jalankan di database MySQL 8.4 PRIMA.

CREATE TABLE IF NOT EXISTS bba_barang (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama          VARCHAR(160) NOT NULL,
  kategori_aset VARCHAR(64)  NULL,
  satuan        VARCHAR(32)  NULL,
  created_by    INT          NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_barang_nama (nama),
  CONSTRAINT fk_bba_barang_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — master jenis barang (kunci riwayat beli & eksisting)';

ALTER TABLE buku_besar_aset
  ADD COLUMN barang_id  INT UNSIGNED NULL AFTER kategori_aset,
  ADD COLUMN tgl_proses DATE NULL AFTER status,
  MODIFY COLUMN status ENUM('DIRENCANAKAN','DIPROSES','REALISASI_PENUH','REALISASI_SEBAGIAN','TIDAK_TEREALISASI')
                NOT NULL DEFAULT 'DIRENCANAKAN',
  ADD KEY idx_bba_barang (barang_id),
  ADD CONSTRAINT fk_bba_barang FOREIGN KEY (barang_id) REFERENCES bba_barang(id) ON DELETE RESTRICT;
