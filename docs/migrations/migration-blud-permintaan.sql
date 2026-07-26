-- migration-blud-permintaan.sql
-- CONCEPT-blud-realisasi.md §4.1 & §4.2 — Fase 4
--
-- Catatan permintaan dari bendahara ke pemegang DPA. Tabel ini TIDAK pernah
-- menyentuh pagu: ia hanya mencatat "ada yang perlu digeser / ada rekening yang
-- perlu ditambah" supaya permintaannya tidak hilang di percakapan WA.
-- Angkanya tetap ditentukan manusia di menu Pergeseran.

CREATE TABLE IF NOT EXISTS blud_permintaan (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  jenis          ENUM('PERGESERAN','REKENING_BARU') NOT NULL,
  anggaran_key   VARCHAR(64)       NULL COMMENT 'NULL utk REKENING_BARU — barisnya memang belum ada',
  kode_rekening  VARCHAR(64)       NULL,
  uraian         TEXT          NOT NULL,
  kekurangan     DECIMAL(18,2) NOT NULL DEFAULT 0,
  status         ENUM('MENUNGGU','SELESAI','DITOLAK') NOT NULL DEFAULT 'MENUNGGU',
  tx_id          BIGINT UNSIGNED   NULL COMMENT 'transaksi pemicu (utk REKENING_BARU)',
  diminta_oleh   INT               NULL,
  diminta_username VARCHAR(64)     NULL COMMENT 'disalin supaya notif balik tetap terkirim walau user dihapus',
  diminta_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  selesai_at     DATETIME          NULL,
  INDEX idx_status (tahun_anggaran, status),
  INDEX idx_key (tahun_anggaran, anggaran_key, status),
  CONSTRAINT fk_bpm_user FOREIGN KEY (diminta_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Permintaan pergeseran / penambahan rekening dari bendahara';
