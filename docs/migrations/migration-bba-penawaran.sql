-- BBA revamp Tahap 5 — Penawaran Rekanan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: menu Penawaran, "Ambil dari penawaran" di referensi
-- harga, hapus/gabung barang, dan Simpan referensi membaca tabel & kolom ini. Tanpa data awal (tabel baru kosong).
--
-- Penawaran = gudang harga dari rekanan; yang dipakai rencana DISALIN ke bba_referensi_harga (referensi beku sejak
-- dipesan), `penawaran_item_id` hanya jejak salinan (soft-FK — penawaran boleh dihapus, referensinya tetap utuh).

CREATE TABLE bba_penawaran (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rekanan        VARCHAR(160) NOT NULL,
  nomor_surat    VARCHAR(120) NULL,
  tgl_surat      DATE         NOT NULL,
  berlaku_sampai DATE         NULL COMMENT 'NULL = tanpa batas tertulis',
  kategori       VARCHAR(80)  NULL,
  file_id        VARCHAR(64)  NULL COMMENT 'Soft-FK uploaded_files.file_id (context buku_besar_aset) — berkas surat',
  catatan        VARCHAR(500) NULL,
  version        INT UNSIGNED NOT NULL DEFAULT 0,
  created_by     INT          NULL,
  updated_by     INT          NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bpw_tgl (tgl_surat),
  KEY idx_bpw_rekanan (rekanan),
  CONSTRAINT fk_bpw_dibuat FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_bpw_diubah FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — surat penawaran rekanan (gudang harga untuk referensi rencana)';

CREATE TABLE bba_penawaran_item (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  penawaran_id BIGINT UNSIGNED NOT NULL,
  barang_id    INT UNSIGNED  NULL COMMENT 'NULL = belum ditautkan ke Master Barang',
  nama_barang  VARCHAR(255)  NOT NULL COMMENT 'Teks asli di surat',
  merk_tipe    VARCHAR(160)  NULL,
  spesifikasi  VARCHAR(500)  NULL,
  satuan       VARCHAR(40)   NULL,
  harga_satuan DECIMAL(18,2) NOT NULL,
  urutan       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_bpwi_penawaran (penawaran_id, urutan),
  KEY idx_bpwi_barang (barang_id),
  CONSTRAINT fk_bpwi_penawaran FOREIGN KEY (penawaran_id) REFERENCES bba_penawaran(id) ON DELETE CASCADE,
  CONSTRAINT fk_bpwi_barang FOREIGN KEY (barang_id) REFERENCES bba_barang(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — item per surat penawaran; dibandingkan per barang × satuan';

ALTER TABLE bba_referensi_harga
  ADD COLUMN penawaran_item_id BIGINT UNSIGNED NULL COMMENT 'Soft-FK bba_penawaran_item.id — jejak salinan dari penawaran' AFTER file_id;
