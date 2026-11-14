-- migration-renaksi-pagu-sumber.sql
-- Pagu Rencana Aksi per sumber dana + babak Perubahan per tahun.
-- Konsep: docs/CONCEPT-renaksi-pagu-rko.md (§3, §4, Tahap A').
--
-- KENAPA: pagu sub kegiatan dulu satu angka tanpa sumber (`rencana_aksi.anggaran_nominal`).
-- Satu program bisa didanai APBD dan BLUD sekaligus, dan RKO E-Anggaran mencatat sumber dana
-- per rekening — pembandingnya butuh pagu Renaksi per sumber. Anggaran Perubahan juga dulu
-- harus MENIMPA angka Murni.
--
-- `rencana_aksi.anggaran_nominal` TETAP ada sebagai total pagu berlaku per baris, ditulis HANYA
-- oleh server (= Σ rincian) di transaksi yang sama — Cetak, Realisasi, RIMA tetap membacanya.
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: tanpa tabelnya, daftar Rencana
-- Aksi (yang memuat rincian pagu) gagal dimuat. Aman diulang (IF NOT EXISTS + INSERT IGNORE).

CREATE TABLE IF NOT EXISTS rencana_aksi_pagu (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rencana_aksi_id  INT UNSIGNED NOT NULL,
  sumber           VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'Sumber dana; kosong = tanpa sumber (data lama)',
  pagu             BIGINT NULL COMMENT 'Pagu Murni (Rp)',
  pagu_perubahan   BIGINT NULL COMMENT 'Pagu Perubahan (Rp); NULL = belum diubah, berlaku Murni',
  urutan           SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_rap_baris_sumber (rencana_aksi_id, sumber),
  CONSTRAINT fk_rap_baris FOREIGN KEY (rencana_aksi_id) REFERENCES rencana_aksi(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rincian pagu baris indikator sub kegiatan Rencana Aksi per sumber dana';

CREATE TABLE IF NOT EXISTS renaksi_pagu_perubahan (
  tahun         SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
  dimulai_pada  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dimulai_oleh  INT NULL,
  CONSTRAINT fk_rpp_oleh FOREIGN KEY (dimulai_oleh) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tahun Rencana Aksi yang sudah memasuki babak Pagu Perubahan (Murni dibekukan)';

-- Pagu lama tanpa sumber dipindah jadi satu rincian "tanpa sumber" — dibetulkan sendiri lewat
-- pensil tiap baris di Data Entry (keputusan pemilik 2026-11-14, tidak ditebak).
INSERT IGNORE INTO rencana_aksi_pagu (rencana_aksi_id, sumber, pagu)
SELECT id, '', anggaran_nominal
FROM rencana_aksi
WHERE level = 'sub-kegiatan' AND anggaran_nominal IS NOT NULL;
