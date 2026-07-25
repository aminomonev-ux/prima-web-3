-- migration-blud-realisasi-tx.sql
-- Modul Realisasi BLUD — Fase 2: Buku Kas (satu-satunya titik input).
-- Konsep: docs/CONCEPT-blud-realisasi.md §2.2, §4.7, §6.2
--
-- Prasyarat: migration-blud-realisasi-anggaran-key.sql sudah jalan.
--
-- Kolom turunan SENGAJA TIDAK ADA di sini — dihitung server saat dibaca:
--   pagu · terserap · sisa · persen · saldo_berjalan · realisasi_bulan_lalu
-- Menyimpan saldo berjalan berarti menyisipkan 1 transaksi di tengah = menulis
-- ulang ratusan baris di bawahnya (§2.7).

-- 1) Transaksi kas/bank — satu baris = satu baris BKU
CREATE TABLE IF NOT EXISTS blud_realisasi_tx (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  bulan          TINYINT UNSIGNED  NOT NULL COMMENT '1..12',
  tanggal        DATE          NOT NULL,
  no_kwt         INT UNSIGNED      NULL COMMENT 'NULL utk baris non-kuitansi (saldo awal, ambil bank)',
  jenis          ENUM('BELANJA','AMBIL_BANK','SETOR_BANK','PENERIMAAN','LAIN') NOT NULL DEFAULT 'BELANJA',
  uraian         TEXT          NOT NULL,
  kas_masuk      DECIMAL(18,2) NOT NULL DEFAULT 0,
  kas_keluar     DECIMAL(18,2) NOT NULL DEFAULT 0,
  bank_masuk     DECIMAL(18,2) NOT NULL DEFAULT 0,
  bank_keluar    DECIMAL(18,2) NOT NULL DEFAULT 0,
  status         ENUM('NORMAL','BELUM_BERREKENING') NOT NULL DEFAULT 'NORMAL'
                 COMMENT 'BELUM_BERREKENING = uang sudah keluar tapi rekeningnya belum ada di DPA (§4.2)',
  version        INT           NOT NULL DEFAULT 0 COMMENT 'CAS per-baris (L48)',
  created_by     INT               NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kwt (tahun_anggaran, bulan, no_kwt),
  INDEX idx_periode (tahun_anggaran, bulan, tanggal, id),
  INDEX idx_status  (status),
  CONSTRAINT fk_brt_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Transaksi kas/bank (sumber BKU & seluruh sheet turunan)';

-- 2) Pembebanan transaksi ke baris anggaran — 1 transaksi bisa N baris (§2.5)
CREATE TABLE IF NOT EXISTS blud_realisasi_alokasi (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tx_id          BIGINT UNSIGNED NOT NULL,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL COMMENT 'denormal — index SUM per tahun tanpa join',
  anggaran_key   VARCHAR(64)   NOT NULL,
  nilai          DECIMAL(18,2) NOT NULL,
  INDEX idx_key (tahun_anggaran, anggaran_key),
  INDEX idx_tx  (tx_id),
  CONSTRAINT fk_bra_tx FOREIGN KEY (tx_id) REFERENCES blud_realisasi_tx(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Alokasi transaksi ke baris anggaran (jangkar anggaran_key)';

-- 3) Periode bulanan — saldo awal, sisi nyata Tutup Kas, status buka/tutup
CREATE TABLE IF NOT EXISTS blud_periode (
  tahun_anggaran  SMALLINT UNSIGNED NOT NULL,
  bulan           TINYINT UNSIGNED  NOT NULL,
  status          ENUM('BUKA','TUTUP') NOT NULL DEFAULT 'BUKA',
  saldo_awal_kas  DECIMAL(18,2) NOT NULL DEFAULT 0,
  saldo_awal_bank DECIMAL(18,2) NOT NULL DEFAULT 0,
  kas_fisik       DECIMAL(18,2)     NULL COMMENT 'sisi B Tutup Kas: hasil hitung uang tunai (§4.7)',
  bank_koran      DECIMAL(18,2)     NULL COMMENT 'sisi B Tutup Kas: saldo rekening koran (§4.7)',
  no_surat        VARCHAR(64)       NULL,
  tgl_surat       DATE              NULL,
  ditutup_oleh    INT               NULL,
  ditutup_at      DATETIME          NULL,
  PRIMARY KEY (tahun_anggaran, bulan),
  CONSTRAINT fk_bp_user FOREIGN KEY (ditutup_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Periode bulanan realisasi (saldo awal + kunci tutup kas)';
