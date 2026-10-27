-- BBA Tahap D — rencana di atas buku aset (docs/CONCEPT-bba-buku-aset.md §7.3, §7.7, §8, §15).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang, SESUDAH migration-bba-ruang.sql:
-- daftar Rencana, modal item, dan Excel daftar rencana membaca kolom & tabel ini.
--
-- jenis_rencana NULL = rencana lama yang belum digolongkan (tetap sah).
-- anggaran = tanda "masuk anggaran" oleh Perencanaan (PROGRAM). Rencana yang sudah dipesan/diterima
-- jelas sudah didanai, jadi diisi DIDANAI dengan volume & nilai rencananya; sisanya BELUM.
-- asal_rencana_id = soft-FK buku_besar_aset.id — rencana tahun lalu yang tidak didanai lalu disalin.

ALTER TABLE buku_besar_aset
  ADD COLUMN jenis_rencana   ENUM('PENGGANTIAN','PENAMBAHAN','PENGADAAN_BARU','PEMELIHARAAN','REHAB') NULL AFTER barang_id,
  ADD COLUMN alasan          VARCHAR(1000) NULL AFTER jenis_rencana,
  ADD COLUMN anggaran        ENUM('BELUM','DIDANAI','TIDAK_DIDANAI') NOT NULL DEFAULT 'BELUM' AFTER status,
  ADD COLUMN anggaran_vol    DECIMAL(18,2) NULL AFTER anggaran,
  ADD COLUMN anggaran_nilai  DECIMAL(18,2) NULL AFTER anggaran_vol,
  ADD COLUMN anggaran_pada   DATETIME      NULL AFTER anggaran_nilai,
  ADD COLUMN anggaran_oleh   INT           NULL AFTER anggaran_pada,
  ADD COLUMN asal_rencana_id BIGINT UNSIGNED NULL COMMENT 'Disalin dari rencana tahun lalu yang tidak didanai',
  ADD KEY idx_bba_anggaran (tahun_anggaran, anggaran),
  ADD KEY idx_bba_asal_rencana (asal_rencana_id);

UPDATE buku_besar_aset
   SET anggaran = 'DIDANAI', anggaran_vol = vol, anggaran_nilai = nilai_rencana
 WHERE status IN ('DIPROSES', 'REALISASI_PENUH', 'REALISASI_SEBAGIAN');

CREATE TABLE bba_rencana_aset (
  rencana_id BIGINT UNSIGNED NOT NULL,
  aset_id    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (rencana_id, aset_id),
  KEY idx_bra_aset_sasaran (aset_id),
  CONSTRAINT fk_bra_rencana FOREIGN KEY (rencana_id) REFERENCES buku_besar_aset(id) ON DELETE CASCADE,
  CONSTRAINT fk_bra_aset_sasaran FOREIGN KEY (aset_id) REFERENCES bba_aset(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — aset sasaran rencana (yang diganti, diperbaiki, direhab)';

ALTER TABLE bba_referensi_harga
  ADD COLUMN merk_tipe VARCHAR(160) NULL AFTER nama_penyedia;
