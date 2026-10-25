-- Migration: Buku Besar Aset — referensi harga + bukti dukung per item (Tahap 1)
-- Konsep: docs/CONCEPT-bba-perencanaan.md §4 (dieksekusi 2026-10-22).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: daftar BBA membaca kedua
-- tabel ini untuk kolom Ref & Bukti, jadi tanpa tabelnya layar Buku Besar Aset gagal dimuat.
-- Aman untuk data lama: item yang sudah ada hanya belum punya referensi/bukti. Tautan
-- url_merk1–3 dari Usulan TIDAK disalin ke sini — dibaca langsung dari usulan_items selama
-- item belum punya referensi tersimpan (§4.1, satu aturan tanpa pengisi).
-- Item dihapus → referensi & bukti ikut terhapus (CASCADE); berkas di Drive tetap.
-- Jalankan di database MySQL 8.4 PRIMA.

CREATE TABLE IF NOT EXISTS bba_referensi_harga (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aset_id       BIGINT UNSIGNED NOT NULL,
  urutan        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  sumber        ENUM('EKATALOG','TOKO_DARING','TOKO_LURING','LAINNYA') NOT NULL DEFAULT 'LAINNYA',
  nama_penyedia VARCHAR(255)  NULL,
  url           VARCHAR(2048) NULL,
  harga         DECIMAL(18,2) NULL,
  tgl_cek       DATE          NULL,
  file_id       VARCHAR(64)   NULL COMMENT 'Soft-FK uploaded_files.file_id (context buku_besar_aset) — tangkapan layar/nota',
  PRIMARY KEY (id),
  KEY idx_bra_aset (aset_id, urutan),
  CONSTRAINT fk_bra_aset FOREIGN KEY (aset_id) REFERENCES buku_besar_aset(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — referensi harga per item (survei harga); ditulis ulang tiap Simpan item';

CREATE TABLE IF NOT EXISTS bba_lampiran (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aset_id     BIGINT UNSIGNED NOT NULL,
  jenis       ENUM('BUKTI_BELI','BAST','FOTO','LAINNYA') NOT NULL,
  nama        VARCHAR(255)  NOT NULL,
  url         VARCHAR(2048) NULL,
  file_id     VARCHAR(64)   NULL COMMENT 'Soft-FK uploaded_files.file_id (context buku_besar_aset)',
  keterangan  VARCHAR(500)  NULL,
  created_by  INT           NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bl_aset (aset_id, jenis),
  CONSTRAINT fk_bl_aset FOREIGN KEY (aset_id)    REFERENCES buku_besar_aset(id) ON DELETE CASCADE,
  CONSTRAINT fk_bl_user FOREIGN KEY (created_by) REFERENCES users(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — bukti dukung per item; ditulis per aksi (tambah/hapus), hapus tidak menyentuh Drive';
