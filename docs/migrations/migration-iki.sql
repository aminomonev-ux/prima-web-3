-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Modul IKI (Indikator Kinerja Individu)
-- Konsep: docs/CONCEPT-iki.md
-- 3 tabel: iki_dokumen → iki_rhk → iki_rhk_triwulan
-- Varian layout: STANDAR (11 kolom, 2 ttd) / DIREKTUR (8 kolom, ttd tunggal)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS iki_dokumen (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  tahun             VARCHAR(4) NOT NULL,
  varian            ENUM('STANDAR','DIREKTUR') NOT NULL DEFAULT 'STANDAR',
  opd               VARCHAR(255) NOT NULL DEFAULT 'RSJD dr. Amino Gondohutomo Provinsi Jawa Tengah',
  nama              VARCHAR(255) NOT NULL,
  nip               VARCHAR(50)  NOT NULL,
  jabatan           VARCHAR(255) NOT NULL,
  pangkat           VARCHAR(100) NULL,
  ikhtisar          TEXT NULL,
  nama_atasan       VARCHAR(255) NULL,
  nip_atasan        VARCHAR(50)  NULL,
  jabatan_atasan    VARCHAR(255) NULL,
  pangkat_atasan    VARCHAR(100) NULL,
  kota_ttd          VARCHAR(100) NOT NULL DEFAULT 'Semarang',
  tanggal_ttd       DATE NULL,
  atasan_dokumen_id INT NULL COMMENT 'Soft-FK iki_dokumen atasan (kaskade RHK) — L68 cek eksistensi di app',
  status            ENUM('DRAFT','FINAL') NOT NULL DEFAULT 'DRAFT',
  version           INT NOT NULL DEFAULT 0 COMMENT 'L48 CAS optimistic lock dokumen-level',
  created_by        INT NULL,
  updated_by        INT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iki_nip_tahun (nip, tahun),
  INDEX idx_iki_tahun_status (tahun, status),
  CONSTRAINT fk_iki_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_iki_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='IKI - header dokumen Indikator Kinerja Individu (1 pegawai x 1 tahun)';

CREATE TABLE IF NOT EXISTS iki_rhk (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  dokumen_id      INT NOT NULL,
  no_urut         INT NOT NULL COMMENT 'Kolom No. — rowspan grup RHK-diintervensi',
  rhk_intervensi  VARCHAR(500) NULL COMMENT 'Kolom 2 varian STANDAR; NULL untuk DIREKTUR',
  rhk             VARCHAR(500) NOT NULL,
  aspek_a         VARCHAR(50) NOT NULL DEFAULT 'Kuantitatif',
  aspek_b         ENUM('Akumulatif','Progres Positif','Progres Negatif','Pengulangan') NOT NULL DEFAULT 'Akumulatif',
  aspek_c         ENUM('Utama','Penunjang') NOT NULL DEFAULT 'Utama',
  indikator       VARCHAR(500) NOT NULL,
  target_tahunan  VARCHAR(50) NOT NULL DEFAULT '',
  formulasi       TEXT NULL,
  ekspektasi      TEXT NULL COMMENT 'NULL untuk varian DIREKTUR (kolom Formulasi saja)',
  renaksi_id      INT NULL COMMENT 'Soft-FK jejak asal rencana_aksi.id (L68)',
  atasan_rhk_id   INT NULL COMMENT 'Soft-FK jejak asal iki_rhk atasan (kaskade)',
  urutan          INT NOT NULL DEFAULT 0,
  INDEX idx_iki_rhk_dok (dokumen_id, no_urut, urutan),
  CONSTRAINT fk_iki_rhk_dok FOREIGN KEY (dokumen_id) REFERENCES iki_dokumen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='IKI - baris Rencana Hasil Kerja (kolom 2-8 form)';

CREATE TABLE IF NOT EXISTS iki_rhk_triwulan (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  rhk_id      INT NOT NULL,
  triwulan    TINYINT NOT NULL COMMENT '1..4',
  target_tw   VARCHAR(50) NOT NULL DEFAULT '0',
  uraian      TEXT NULL,
  target_aksi VARCHAR(50) NOT NULL DEFAULT '0',
  UNIQUE KEY uk_iki_tw (rhk_id, triwulan),
  CONSTRAINT fk_iki_tw_rhk FOREIGN KEY (rhk_id) REFERENCES iki_rhk(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='IKI - target & rencana aksi per triwulan (kolom 9-11 form)';

-- App flag maintenance/online (pola app_status_*)
INSERT IGNORE INTO app_config (`key`, value) VALUES ('app_status_iki', 'online');
