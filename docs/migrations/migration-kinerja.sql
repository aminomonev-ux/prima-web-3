-- ═══════════════════════════════════════════════════════════════════════════
-- PRIMA — E-Anggaran Migration (Phase 1 & 2)
-- Jalankan di MySQL 8.0+ setelah schema-mysql.sql
-- ═══════════════════════════════════════════════════════════════════════════

USE prima_db;

-- ─── KINERJA MASTER REKENING ──────────────────────────────────────────────────
-- Menampung: Program, Kegiatan, Sub Kegiatan, Uraian SSK (per sumber)
CREATE TABLE IF NOT EXISTS kinerja_master (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun      VARCHAR(10)  NOT NULL DEFAULT '2025',
  tipe       ENUM('program','kegiatan','subkegiatan','uraian_ssk') NOT NULL,
  sumber     ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS') DEFAULT NULL,
  nama       VARCHAR(255) NOT NULL,
  urut       INT          NOT NULL DEFAULT 0,
  created_by INT          DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT NOW(),
  updated_at DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_km_tahun_tipe ON kinerja_master (tahun, tipe);
CREATE INDEX idx_km_sumber     ON kinerja_master (sumber);

-- ─── KINERJA REKENING ────────────────────────────────────────────────────────
-- Hierarki rekening per sumber anggaran
CREATE TABLE IF NOT EXISTS kinerja_rekening (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun           VARCHAR(10)  NOT NULL DEFAULT '2025',
  sumber          ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS') NOT NULL,
  uraian          VARCHAR(500) NOT NULL,
  uraian_ssk      VARCHAR(255) DEFAULT NULL,
  sumber_anggaran VARCHAR(100) DEFAULT NULL,
  program         VARCHAR(255) DEFAULT NULL,
  kegiatan        VARCHAR(255) DEFAULT NULL,
  subkegiatan     VARCHAR(255) DEFAULT NULL,
  urut            INT          NOT NULL DEFAULT 0,
  created_by      INT          DEFAULT NULL,
  updated_by      INT          DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT NOW(),
  updated_at      DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kr_tahun_sumber ON kinerja_rekening (tahun, sumber);

-- ─── KINERJA SSK (RKO — Target Fisik per Bulan) ──────────────────────────────
-- months / months_pct disimpan sebagai JSON: {"jan":0,"feb":0,...,"des":0}
CREATE TABLE IF NOT EXISTS kinerja_ssk (
  id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun       VARCHAR(10)   NOT NULL DEFAULT '2025',
  sumber      ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS') NOT NULL,
  uraian_ssk  VARCHAR(255)  NOT NULL DEFAULT '',
  uraian      VARCHAR(500)  NOT NULL,
  pagu        DECIMAL(18,2) NOT NULL DEFAULT 0,
  months      JSON          DEFAULT NULL,
  months_pct  JSON          DEFAULT NULL,
  total       DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_pct   DECIMAL(7,2)  NOT NULL DEFAULT 0,
  urut        INT           NOT NULL DEFAULT 0,
  updated_by  INT           DEFAULT NULL,
  updated_at  DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ks_tahun_sumber ON kinerja_ssk (tahun, sumber);

-- ─── APP CONFIG: tambah status kinerja ───────────────────────────────────────
INSERT IGNORE INTO app_config (`key`, value)
VALUES ('app_status_kinerja', 'online');

-- ═══════════════════════════════════════════════════════════════════════════
-- Selesai. Phase 3/4 (Realisasi, Pendapatan/CRR) akan ditambahkan terpisah.
-- ═══════════════════════════════════════════════════════════════════════════
