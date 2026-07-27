-- migration-blud-potongan-pengembalian.sql
-- BLUD Buku Kas: (1) rincian potongan pihak ketiga pada transaksi belanja,
--                (2) jenis transaksi PENGEMBALIAN + alokasi bernilai negatif.
--
-- (1) Pajak yang dipungut/dipotong dari pembayaran vendor ditahan lalu langsung
--     disetorkan — masuk dan keluar sama besar di hari yang sama, dan pagunya
--     sudah habis di baris belanja induknya. Disimpan sebagai RINCIAN transaksi,
--     bukan transaksi tersendiri; baris masuk/keluar di BKU dibangkitkan saat
--     cetak. Ikut menampung potongan non-pajak (koperasi, Baznas, BPJS TK).
--
-- (2) PENGEMBALIAN wajib jadi nilai terakhir pada ENUM: MySQL menyimpan ENUM
--     sebagai indeks, menyisipkan di tengah akan menggeser arti baris lama.

CREATE TABLE IF NOT EXISTS blud_realisasi_potongan (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tx_id          BIGINT UNSIGNED NOT NULL,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL COMMENT 'denormal — rekap per tahun tanpa join',
  jenis          ENUM('PPN','PPH_21','PPH_22','PPH_23','PPH_4_2','PPH_FINAL',
                      'KOPERASI','BAZNAS','BPJS_TK','LAINNYA') NOT NULL,
  keterangan     VARCHAR(191)  NULL COMMENT 'mis. nama rekanan / nomor faktur',
  nilai          DECIMAL(18,2) NOT NULL,
  urutan         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_tx    (tx_id),
  INDEX idx_rekap (tahun_anggaran, jenis),
  CONSTRAINT fk_brpot_tx FOREIGN KEY (tx_id) REFERENCES blud_realisasi_tx(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Potongan pihak ketiga pada transaksi belanja (pajak + non-pajak)';

ALTER TABLE blud_realisasi_tx
  MODIFY COLUMN jenis ENUM('BELANJA','AMBIL_BANK','SETOR_BANK','PENERIMAAN','LAIN','PENGEMBALIAN')
    NOT NULL DEFAULT 'BELANJA';

-- DECIMAL sudah bertanda; yang berubah cuma artinya, dan itu perlu tercatat di
-- skema supaya `SUM(nilai)` tidak pernah lagi dibaca sebagai "selalu bertambah".
ALTER TABLE blud_realisasi_alokasi
  MODIFY COLUMN nilai DECIMAL(18,2) NOT NULL
    COMMENT 'positif = membebani pagu; negatif = pengembalian belanja (jenis PENGEMBALIAN)';
