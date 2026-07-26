-- ─────────────────────────────────────────────────────────────────────────────
-- migration-blud-gu-periode.sql — periode Ganti Uang Persediaan (GU) per bulan
-- Konsep: docs/CONCEPT-blud-realisasi.md §3.2, keputusan #31
--
-- Apply:
--   mysql -u root -p prima_db_3 < docs/migrations/migration-blud-gu-periode.sql
--
-- Berkas Juni 2026 asli punya satu lembar `GU 1-26 Juni 2026` — bukan sebulan
-- penuh, tapi tanggal 1 s/d 26. Bulan lain bisa punya dua atau tiga pengajuan,
-- tergantung seberapa cepat uang persediaan terpakai. Rentang itu tidak bisa
-- diterka dari transaksi (tidak ada penanda "GU ke-2 mulai di sini"), jadi harus
-- dicatat sendiri.
--
-- Yang DISIMPAN cuma rentang tanggalnya. Angka realisasinya tetap dihitung saat
-- lembar dibuat — sama seperti seluruh modul ini, tidak ada angka turunan yang
-- diendapkan lalu basi.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blud_gu_periode (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  bulan          TINYINT UNSIGNED  NOT NULL,
  urutan         TINYINT UNSIGNED  NOT NULL DEFAULT 1 COMMENT 'GU ke-berapa dalam bulan itu',
  tgl_awal       DATE          NOT NULL,
  tgl_akhir      DATE          NOT NULL,
  no_surat       VARCHAR(64)       NULL,
  updated_by     INT               NULL,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gu (tahun_anggaran, bulan, urutan),
  INDEX idx_periode (tahun_anggaran, bulan, tgl_awal),
  CONSTRAINT fk_bgu_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Rentang tanggal pengajuan GU per bulan (sumber nama & isi lembar GU)';
