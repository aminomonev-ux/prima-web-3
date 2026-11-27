-- BBA — Penawaran Rekanan mengikuti Matriks Inventarisasi (docs/konsep/bba/CONCEPT-bba-penawaran-matriks.md §7).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: daftar Penawaran, Ambil dari penawaran, unduhan Excel,
-- dan salinan Drive membaca kolom-kolom ini. Tanpa data awal — surat lama tampil seperti sebelumnya.

ALTER TABLE bba_penawaran
  ADD COLUMN jenis_surat          VARCHAR(80)  NULL COMMENT 'Jenis surat (daftar Matriks atau ketik sendiri); NULL = dianggap surat berharga' AFTER berlaku_sampai,
  ADD COLUMN pic_kontak           VARCHAR(255) NULL COMMENT 'PIC & kontak rekanan pada surat ini' AFTER rekanan,
  ADD COLUMN masa_berlaku_teks    VARCHAR(60)  NULL COMMENT 'Bunyi masa berlaku di surat ("14 (empat belas) hari"); penentu tetap berlaku_sampai' AFTER berlaku_sampai,
  ADD COLUMN status_tindak_lanjut ENUM('MENUNGGU_PRESENTASI','MENUNGGU_DEMO','PERLU_TELAAH','LANJUT','ARSIP','DITOLAK') NULL AFTER catatan,
  MODIFY COLUMN catatan           VARCHAR(1000) NULL COMMENT 'Syarat & pengecualian';

ALTER TABLE bba_penawaran_item
  ADD COLUMN merk         VARCHAR(80)  NULL COMMENT 'Merk; merk_tipe kini berarti Tipe' AFTER nama_barang,
  ADD COLUMN status_pajak ENUM('TERMASUK','BELUM','BEBAS','TIDAK_DISEBUT') NULL AFTER harga_satuan,
  ADD COLUMN tautan       VARCHAR(500) NULL COMMENT 'Link e-Katalog / referensi — ikut tersalin ke referensi rencana' AFTER status_pajak,
  ADD COLUMN garansi      VARCHAR(120) NULL AFTER tautan,
  MODIFY COLUMN harga_satuan DECIMAL(18,2) NULL COMMENT 'NULL = surat belum mencantumkan harga';
