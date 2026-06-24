-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 032: Rencana Aksi (modul baru — slot rencana_aksi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Single-table flat. Triwulan fix 4 (Permendagri 86/2017), tidak dinamis.
-- Unique key (tahun, level, indikator) → upsert per indikator per level per tahun.
-- Volume estimasi: ~200 row/tahun, ~4.000 row total (2026-2045).

CREATE TABLE IF NOT EXISTS rencana_aksi (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun           SMALLINT UNSIGNED NOT NULL                COMMENT 'Periode rencana aksi (2026-2045)',
  level           ENUM('sasaran','program','kegiatan','sub-kegiatan') NOT NULL,
  program         VARCHAR(255) NOT NULL                     COMMENT 'Nama Sasaran (level=sasaran) atau Program (lainnya)',
  kegiatan        VARCHAR(255) NULL                         COMMENT 'Hanya wajib untuk level kegiatan/sub-kegiatan',
  sub_kegiatan    VARCHAR(255) NULL                         COMMENT 'Hanya wajib untuk level sub-kegiatan',
  indikator       VARCHAR(500) NOT NULL,
  jenis           ENUM('Akumulatif','Progres Positif','Pengulangan') NOT NULL DEFAULT 'Akumulatif',
  satuan          VARCHAR(50)  NOT NULL DEFAULT 'Persen',
  target_rpjmd    INT          NOT NULL DEFAULT 0,
  target_tahunan  INT          NOT NULL DEFAULT 0,
  q1_target       INT          NOT NULL DEFAULT 0,
  q1_realisasi    INT          NOT NULL DEFAULT 0,
  q2_target       INT          NOT NULL DEFAULT 0,
  q2_realisasi    INT          NOT NULL DEFAULT 0,
  q3_target       INT          NOT NULL DEFAULT 0,
  q3_realisasi    INT          NOT NULL DEFAULT 0,
  q4_target       INT          NOT NULL DEFAULT 0,
  q4_realisasi    INT          NOT NULL DEFAULT 0,
  created_by      INT          NULL,
  updated_by      INT          NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tahun_level_ind (tahun, level, indikator),
  INDEX idx_tahun_level (tahun, level),
  INDEX idx_tahun_level_prog (tahun, level, program),
  CONSTRAINT fk_ra_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ra_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rencana Aksi - target & realisasi triwulan per indikator (4 level hierarki)';
