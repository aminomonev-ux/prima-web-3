-- migration-kinerja-realisasi-map.sql — IK-4: peta tersimpan keterangan Excel → SSK.
-- Diajari sekali (user konfirmasi match di modal) → bulan berikutnya auto-cocok.
-- UNIQUE per (tahun, keterangan_excel): satu keterangan Excel = satu SSK per tahun.

CREATE TABLE IF NOT EXISTS kinerja_realisasi_map (
  id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun            VARCHAR(10)  NOT NULL,
  sumber           ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  keterangan_excel VARCHAR(500) NOT NULL COMMENT 'Uraian dari file Excel (mentah)',
  ssk_canonical_id VARCHAR(20)  NOT NULL COMMENT 'Target SSK (link ke kinerja_realisasi.ssk_canonical_id)',
  updated_by       INT          DEFAULT NULL,
  updated_at       DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY uq_krm_tahun_ket (tahun, keterangan_excel),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_krm_tahun ON kinerja_realisasi_map (tahun);
