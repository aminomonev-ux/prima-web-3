-- BBA Tahap B — buku aset per register (docs/CONCEPT-bba-buku-aset.md §5, §15).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: halaman Buku Aset, impor KIB,
-- dan hapus/gabung barang & hapus lokasi membaca tabel ini.
-- Aman dijalankan ulang (CREATE TABLE IF NOT EXISTS).

-- Satu baris = satu register KIB provinsi. Kolom yang disaring/dijumlah berdiri sendiri; sisa
-- kolom KIB per golongan di JSON `kib` (definisinya lib/bba/kib.ts). Tidak pernah dihapus fisik:
-- aset yang dihapus berstatus DIHAPUS (§7.6).
CREATE TABLE IF NOT EXISTS bba_aset (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  golongan         ENUM('A','B','C','D','E','F') NOT NULL,
  kode_barang      VARCHAR(80)   NULL COMMENT 'Kode lengkap provinsi (memuat tahun perolehan); NULL = belum teregister',
  register         VARCHAR(20)   NULL,
  kunci_impor      VARCHAR(400)  NULL COMMENT 'Pencocok impor ulang: kode|register (KIB F: isinya) — lib/bba/kib-baca.ts kunciImpor',
  kode_objek       VARCHAR(40)   NULL COMMENT 'Diurai dari kode barang: 1.3.3.01.01.02.001',
  tahun_perolehan  SMALLINT      NULL,
  nama_resmi       VARCHAR(255)  NOT NULL,
  nama             VARCHAR(255)  NULL COMMENT 'Nama sehari-hari (dari Keterangan saat impor pertama, bisa diubah)',
  barang_id        INT UNSIGNED  NULL,
  lokasi_id        INT UNSIGNED  NULL,
  kib              JSON          NOT NULL,
  harga            DECIMAL(18,2) NOT NULL DEFAULT 0,
  asal_usul        VARCHAR(120)  NULL,
  keterangan       VARCHAR(500)  NULL,
  kondisi          ENUM('B','RR','RB') NULL,
  kondisi_tgl      DATE          NULL,
  kondisi_oleh     INT           NULL,
  kondisi_sumber   ENUM('IMPOR','CEK') NULL COMMENT 'IMPOR = dari sistem provinsi, belum dicek (§5.3)',
  status           ENUM('AKTIF','DIHAPUS') NOT NULL DEFAULT 'AKTIF',
  version          INT UNSIGNED  NOT NULL DEFAULT 0,
  created_by       INT           NULL,
  updated_by       INT           NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_aset_kunci (kunci_impor),
  KEY idx_bba_aset_kode (kode_barang, register),
  KEY idx_bba_aset_golongan (golongan, status),
  KEY idx_bba_aset_barang (barang_id),
  KEY idx_bba_aset_lokasi (lokasi_id),
  KEY idx_bba_aset_tahun (tahun_perolehan),
  CONSTRAINT fk_bba_aset_barang FOREIGN KEY (barang_id) REFERENCES bba_barang(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bba_aset_lokasi FOREIGN KEY (lokasi_id) REFERENCES bba_lokasi(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bba_aset_kondisi_oleh FOREIGN KEY (kondisi_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — buku aset per register KIB (golongan A–F)';

-- Riwayat per aset: ditulis di transaksi yang sama dengan perubahannya. `sebelum`/`sesudah`
-- hanya memuat kolom yang berubah.
CREATE TABLE IF NOT EXISTS bba_aset_riwayat (
  id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aset_id  BIGINT UNSIGNED NOT NULL,
  jenis    ENUM('IMPOR','UBAH','KONDISI','PINDAH','TERIMA','REGISTER','REHAB','HAPUS') NOT NULL,
  sebelum  JSON          NULL,
  sesudah  JSON          NULL,
  catatan  VARCHAR(500)  NULL,
  file_id  VARCHAR(64)   NULL COMMENT 'Soft-FK uploaded_files.file_id (context buku_besar_aset) — foto',
  oleh     INT           NULL,
  dicatat_pada DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bar_aset (aset_id, dicatat_pada),
  CONSTRAINT fk_bar_aset FOREIGN KEY (aset_id) REFERENCES bba_aset(id) ON DELETE CASCADE,
  CONSTRAINT fk_bar_oleh FOREIGN KEY (oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — riwayat aset (impor, ubah, kondisi, pindah, terima, register, rehab, hapus)';
