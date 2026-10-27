-- BBA Tahap E — pengadaan & penerimaan (docs/CONCEPT-bba-buku-aset.md §7.4–7.6, §15).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang, SESUDAH migration-bba-rencana.sql:
-- halaman Pengadaan, antrean "barang diterima, belum dicatat", dan penghapusan aset membaca tabel/kolom ini.
--
-- Realisasi rencana (vol/nilai/tgl_realisasi) kini TURUNAN Σ penerimaan dan hanya ditulis jalur penerimaan.
-- Rencana yang sudah terealisasi sebelum tahap ini diberi satu baris penerimaan berisi angka realisasinya,
-- supaya aturan itu berlaku juga untuk data lama (nilai disimpan apa adanya — tidak dihitung ulang dari harga).
-- Baris itu bertanda `pindahan`: barangnya sudah di KIB provinsi, jadi tidak masuk antrean "diterima, belum dicatat".
-- "Yang dibeli" (merk/tipe, penyedia, tautan) disimpan sebagai SALINAN: baris referensi ditulis ulang tiap
-- Simpan item sehingga id-nya berganti.

CREATE TABLE bba_penerimaan (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rencana_id       BIGINT UNSIGNED NOT NULL,
  tgl              DATE          NOT NULL,
  vol              DECIMAL(18,2) NOT NULL,
  harga_satuan     DECIMAL(18,2) NOT NULL,
  nilai            DECIMAL(18,2) NOT NULL COMMENT 'vol × harga satuan saat dicatat; data lama = nilai realisasi apa adanya',
  referensi_urutan TINYINT UNSIGNED NULL COMMENT 'Referensi ke-n yang dipilih; NULL = beli di tempat lain',
  merk_tipe        VARCHAR(160)  NULL,
  penyedia         VARCHAR(255)  NULL,
  url              VARCHAR(2048) NULL,
  catatan          VARCHAR(500)  NULL,
  pindahan         TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 = realisasi lama dipindah migrasi — barangnya sudah di KIB provinsi, tidak masuk antrean',
  created_by       INT           NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bpn_rencana (rencana_id, tgl),
  CONSTRAINT fk_bpn_rencana FOREIGN KEY (rencana_id) REFERENCES buku_besar_aset(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bpn_oleh FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — penerimaan barang per rencana (bertahap); realisasi rencana = Σ baris ini';

INSERT INTO bba_penerimaan (rencana_id, tgl, vol, harga_satuan, nilai, catatan, pindahan)
SELECT b.id, COALESCE(b.tgl_realisasi, MAKEDATE(b.tahun_anggaran, 365)), b.vol_realisasi,
       ROUND(b.nilai_realisasi / b.vol_realisasi, 2), b.nilai_realisasi, 'Realisasi sebelum pencatatan penerimaan (dipindah otomatis)', 1
FROM buku_besar_aset b
WHERE b.status IN ('REALISASI_PENUH', 'REALISASI_SEBAGIAN') AND b.vol_realisasi > 0
  AND NOT EXISTS (SELECT 1 FROM bba_penerimaan p WHERE p.rencana_id = b.id);

ALTER TABLE bba_aset
  ADD COLUMN penerimaan_id  BIGINT UNSIGNED NULL COMMENT 'Lahir dari penerimaan ini (antrean "diterima, belum dicatat")' AFTER barang_id,
  ADD COLUMN siap_dihapus   TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'Diganti lewat rencana penggantian yang sudah diterima' AFTER status,
  ADD COLUMN hapus_sk_nomor VARCHAR(80) NULL AFTER siap_dihapus,
  ADD COLUMN hapus_sk_tgl   DATE        NULL AFTER hapus_sk_nomor,
  ADD KEY idx_bba_aset_penerimaan (penerimaan_id),
  ADD CONSTRAINT fk_bba_aset_penerimaan FOREIGN KEY (penerimaan_id) REFERENCES bba_penerimaan(id) ON DELETE RESTRICT;
