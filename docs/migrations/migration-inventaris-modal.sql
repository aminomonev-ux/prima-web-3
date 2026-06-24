-- migration-inventaris-modal.sql
-- Modul baru: Inventaris Belanja Modal (IBM) — register belanja modal lintas-tahun.
-- Konsep: docs/session/inventaris-modal/CONCEPT.md (v2).
-- MySQL 8.4. Tabel baru (bukan ADD COLUMN) → CREATE TABLE aman.
--
-- canonical_id: identitas stabil lintas-tahun (1 barang modal muncul di banyak tahun).
--   BERULANG antar baris → UNIQUE hanya (canonical_id, tahun_anggaran), bukan canonical_id sendiri.
--   Generasi atomik: derive dari AUTO_INCREMENT id baris pertama ('IM-' + LPAD(id,6)) → tanpa race MAX+1.
-- version: optimistic lock per-row (L48 RA CAS): UPDATE ... version=version+1 WHERE id=? AND version=?.

CREATE TABLE inventaris_modal (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  canonical_id      VARCHAR(20)     NOT NULL DEFAULT '',
  tahun_anggaran    SMALLINT        NOT NULL,
  parent_row_id     BIGINT UNSIGNED NULL,
  kode_rekening     VARCHAR(64)     NULL,
  uraian            TEXT            NOT NULL,
  kategori_aset     VARCHAR(64)     NULL,
  sumber_anggaran   ENUM('BLUD','APBD','DAK','LAINNYA') NOT NULL DEFAULT 'BLUD',
  vol               DECIMAL(18,2)   NOT NULL DEFAULT 0,
  satuan            VARCHAR(32)     NULL,
  harga             DECIMAL(18,2)   NOT NULL DEFAULT 0,
  nilai_rencana     DECIMAL(18,2)   NOT NULL DEFAULT 0,
  status            ENUM('DIRENCANAKAN','REALISASI_PENUH','REALISASI_SEBAGIAN','TIDAK_TEREALISASI','DILUNCURKAN','DIBATALKAN')
                    NOT NULL DEFAULT 'DIRENCANAKAN',
  nilai_realisasi   DECIMAL(18,2)   NOT NULL DEFAULT 0,
  tgl_realisasi     DATE            NULL,
  penanggung_jawab  VARCHAR(128)    NULL,
  dpa_row_id        VARCHAR(64)     NULL,
  dpa_versi_tanggal DATE            NULL,
  keterangan        TEXT            NULL,
  version           INT             NOT NULL DEFAULT 0,
  created_by        INT             NULL,
  updated_by        INT             NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_im_canonical_tahun (canonical_id, tahun_anggaran),
  KEY idx_im_tahun        (tahun_anggaran),
  KEY idx_im_canonical    (canonical_id),
  KEY idx_im_status       (status),
  KEY idx_im_tahun_status (tahun_anggaran, status),
  KEY idx_im_parent       (parent_row_id),
  CONSTRAINT fk_im_parent  FOREIGN KEY (parent_row_id) REFERENCES inventaris_modal(id) ON DELETE SET NULL,
  CONSTRAINT fk_im_created FOREIGN KEY (created_by)     REFERENCES users(id)            ON DELETE SET NULL,
  CONSTRAINT fk_im_updated FOREIGN KEY (updated_by)     REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Inventaris Belanja Modal (IBM) — register belanja modal lintas-tahun + lifecycle status';

-- App-status flag (K4): modul online secara default. Dikelola via Admin Panel → System Status.
INSERT IGNORE INTO app_config (`key`, value) VALUES ('app_status_inventaris_modal', 'online');
