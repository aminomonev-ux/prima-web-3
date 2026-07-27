-- migration-blud-bukti-setor.sql
-- BLUD: lembar "BUKTI SETOR KE BANK BPD" jadi dokumen yang dirakit, bukan
-- laporan yang diturunkan dari jenis transaksi.
-- Konsep: docs/CONCEPT-blud-bukti-setor.md (keputusan #36)
--
-- Penelusuran berkas asli membuktikan lembar itu lembar kerja mandiri: 11 baris
-- + "Ambil Uang" semuanya angka ketikan, hanya "Total" (=SUM) dan "Cash"
-- (=Ambil Uang - Total) yang berupa rumus, dan tak satu pun nominalnya muncul di
-- lembar lain. Menurunkannya dari transaksi memaksa dokumen jadi sesuatu yang
-- bukan dirinya.
--
-- Syarat yang membuat perakitan tetap aman: SETIAP baris tercatat asalnya —
-- `asal` + FK. Baris ber-FK dibaca HIDUP dari sumbernya (uraian & nilai tidak
-- disalin), jadi slip tidak pernah bisa melenceng dari BKU. Baris `KETIK` yang
-- tersisa dihitung dan dinyatakan terang-terangan di layar.

CREATE TABLE IF NOT EXISTS blud_bukti_setor (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  bulan          TINYINT UNSIGNED  NOT NULL COMMENT '1..12',
  tanggal        DATE          NOT NULL,
  no_bukti       VARCHAR(64)       NULL,
  ambil_tx_id    BIGINT UNSIGNED   NULL COMMENT 'transaksi AMBIL_BANK sumber dana — diutamakan',
  ambil_manual   DECIMAL(18,2)     NULL COMMENT 'hanya dipakai kalau tarikannya memang tidak ada di BKU',
  version        INT           NOT NULL DEFAULT 0 COMMENT 'CAS per-baris (L48)',
  created_by     INT               NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_periode (tahun_anggaran, bulan, tanggal, id),
  CONSTRAINT fk_bbs_tx   FOREIGN KEY (ambil_tx_id) REFERENCES blud_realisasi_tx(id) ON DELETE SET NULL,
  CONSTRAINT fk_bbs_user FOREIGN KEY (created_by)  REFERENCES users(id)             ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Bukti setor ke bank (lembar `setor BPD`), satu baris = satu slip';

-- `ON DELETE SET NULL` disengaja, bukan CASCADE: kalau transaksinya dihapus,
-- barisnya HARUS tetap ada supaya tampil sebagai "(transaksi terhapus)" dan ikut
-- dihitung sebagai peringatan. Menghapusnya diam-diam membuat Total berubah tanpa
-- ada yang tahu.
CREATE TABLE IF NOT EXISTS blud_bukti_setor_baris (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bukti_id    BIGINT UNSIGNED NOT NULL,
  urutan      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  asal        ENUM('BKU','POTONGAN','KETIK') NOT NULL,
  tx_id       BIGINT UNSIGNED NULL COMMENT 'asal = BKU',
  potongan_id BIGINT UNSIGNED NULL COMMENT 'asal = POTONGAN',
  uraian      VARCHAR(255)    NULL COMMENT 'asal = KETIK saja; sisanya dibaca hidup dari sumber',
  nilai       DECIMAL(18,2)   NULL COMMENT 'asal = KETIK saja',
  INDEX idx_bukti (bukti_id, urutan),
  INDEX idx_tx    (tx_id),
  CONSTRAINT fk_bbsb_bukti FOREIGN KEY (bukti_id)    REFERENCES blud_bukti_setor(id)        ON DELETE CASCADE,
  CONSTRAINT fk_bbsb_tx    FOREIGN KEY (tx_id)       REFERENCES blud_realisasi_tx(id)       ON DELETE SET NULL,
  CONSTRAINT fk_bbsb_pot   FOREIGN KEY (potongan_id) REFERENCES blud_realisasi_potongan(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Baris bukti setor; asal menentukan apakah dibaca hidup atau ketikan';
