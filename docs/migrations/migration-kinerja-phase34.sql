-- ═══════════════════════════════════════════════════════════════════════════
-- PRIMA — E-Anggaran Migration Phase 3 & 4
-- Jalankan di MySQL 8.0+ setelah migration-kinerja.sql (Phase 1 & 2)
-- ═══════════════════════════════════════════════════════════════════════════

USE prima_db;

-- ─── KINERJA REALISASI NOMENKLATUR ───────────────────────────────────────────
-- Master item/uraian kegiatan per (tahun, sumber) untuk dipakai di realisasi
CREATE TABLE IF NOT EXISTS kinerja_realisasi_nomen (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun      VARCHAR(10)  NOT NULL DEFAULT '2025',
  sumber     ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS') NOT NULL,
  urut       INT          NOT NULL DEFAULT 0,
  keterangan VARCHAR(500) NOT NULL DEFAULT '',
  updated_by INT          DEFAULT NULL,
  updated_at DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_krn_tahun_sumber ON kinerja_realisasi_nomen (tahun, sumber);

-- ─── KINERJA REALISASI ────────────────────────────────────────────────────────
-- Data realisasi per (tahun, sumber, bulan). Batch replace per (tahun, sumber).
CREATE TABLE IF NOT EXISTS kinerja_realisasi (
  id                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun             VARCHAR(10)   NOT NULL DEFAULT '2025',
  sumber            ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS') NOT NULL,
  bulan             TINYINT       NOT NULL COMMENT '1=Jan, 12=Des',
  keterangan        VARCHAR(500)  NOT NULL DEFAULT '',
  pagu_awal         DECIMAL(18,2) NOT NULL DEFAULT 0,
  target_fisik      DECIMAL(18,2) NOT NULL DEFAULT 0,
  real_fisik        DECIMAL(18,2) NOT NULL DEFAULT 0,
  pct_fisik         DECIMAL(7,2)  NOT NULL DEFAULT 0,
  akum_target_fisik DECIMAL(18,2) NOT NULL DEFAULT 0,
  akum_real_fisik   DECIMAL(18,2) NOT NULL DEFAULT 0,
  akum_pct_fisik    DECIMAL(7,2)  NOT NULL DEFAULT 0,
  real_keuangan     DECIMAL(18,2) NOT NULL DEFAULT 0,
  akum_keuangan     DECIMAL(18,2) NOT NULL DEFAULT 0,
  akum_pct_keuangan DECIMAL(7,2)  NOT NULL DEFAULT 0,
  deviasi_fisik     DECIMAL(7,2)  NOT NULL DEFAULT 0,
  deviasi_keuangan  DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_by        INT           DEFAULT NULL,
  updated_at        DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kr_tahun_sumber       ON kinerja_realisasi (tahun, sumber);
CREATE INDEX idx_kr_tahun_sumber_bulan ON kinerja_realisasi (tahun, sumber, bulan);

-- ─── KINERJA PENDAPATAN CRR ──────────────────────────────────────────────────
-- 12 baris tetap per tahun (1 per bulan). Auto-fill dari realisasi BLUD.
CREATE TABLE IF NOT EXISTS kinerja_pendapatan_crr (
  id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun            VARCHAR(10)   NOT NULL DEFAULT '2025',
  bulan_ke         TINYINT       NOT NULL COMMENT '1-12',
  bulan            VARCHAR(20)   NOT NULL DEFAULT '',
  pendapatan       DECIMAL(18,2) NOT NULL DEFAULT 0,
  belanja_blud     DECIMAL(18,2) NOT NULL DEFAULT 0,
  belanja_daerah   DECIMAL(18,2) NOT NULL DEFAULT 0,
  pendapatan_sd    DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 's/d bulan ini',
  belanja_blud_sd  DECIMAL(18,2) NOT NULL DEFAULT 0,
  belanja_daerah_sd DECIMAL(18,2) NOT NULL DEFAULT 0,
  crr_parsial_pct  DECIMAL(7,2)  NOT NULL DEFAULT 0,
  crr_total_pct    DECIMAL(7,2)  NOT NULL DEFAULT 0,
  updated_by       INT           DEFAULT NULL,
  updated_at       DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_crr_tahun_bulan (tahun, bulan_ke)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kpc_tahun ON kinerja_pendapatan_crr (tahun);

-- ─── KINERJA PENDAPATAN REALISASI ─────────────────────────────────────────────
-- Item realisasi pendapatan per tahun (target vs realisasi per keterangan)
CREATE TABLE IF NOT EXISTS kinerja_pendapatan_real (
  id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun       VARCHAR(10)   NOT NULL DEFAULT '2025',
  urut        INT           NOT NULL DEFAULT 0,
  keterangan  VARCHAR(500)  NOT NULL DEFAULT '',
  target      DECIMAL(18,2) NOT NULL DEFAULT 0,
  realisasi   DECIMAL(18,2) NOT NULL DEFAULT 0,
  capaian_pct DECIMAL(7,2)  NOT NULL DEFAULT 0,
  updated_by  INT           DEFAULT NULL,
  updated_at  DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kpr_tahun ON kinerja_pendapatan_real (tahun);

-- ═══════════════════════════════════════════════════════════════════════════
-- Selesai. Phase 3 & 4 siap digunakan.
-- ═══════════════════════════════════════════════════════════════════════════
