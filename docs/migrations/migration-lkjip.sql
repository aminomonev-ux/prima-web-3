-- ═══════════════════════════════════════════════════════════════════════════
-- Migration — LKJIP Builder (modul baru)
-- Penyusun dokumen LKJIP/SAKIP tahunan berbasis outline-tree + blok.
-- Konsep: docs/session/lkjip/CONCEPT.md
--
-- 3 tabel:
--   lkjip_dokumen  — header dokumen (tahun, status DRAFT/FINAL, canonical_id, version)
--   lkjip_section  — node pohon kerangka (adjacency list; parent_id + urutan; nomor DIHITUNG)
--   lkjip_block    — isi tiap section (NARASI | TABEL | GAMBAR), payload JSON
--
-- Catatan FK:
--   - lkjip_section.parent_id TANPA FK (self-ref cascade tak reliable di InnoDB) —
--     hapus subtree ditangani aplikasi (withTransaction).
--   - lkjip_block.section_id FK CASCADE → hapus section ikut hapus blok.
--   - lkjip_section.dokumen_id FK CASCADE → hapus dokumen ikut hapus semua.
-- MySQL 8.4. Jalankan sekali; idempotent via IF NOT EXISTS / INSERT IGNORE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lkjip_dokumen (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  canonical_id  VARCHAR(20)     NOT NULL DEFAULT '' COMMENT 'Identitas stabil lintas-tahun (LKJIP-000001), derive dari AUTO_INCREMENT id',
  tahun         SMALLINT        NOT NULL,
  judul         VARCHAR(255)    NOT NULL,
  jenis         ENUM('LKJIP')   NOT NULL DEFAULT 'LKJIP',
  status        ENUM('DRAFT','FINAL') NOT NULL DEFAULT 'DRAFT',
  nomor_config  JSON            NULL COMMENT 'Override skema gaya nomor per depth; NULL = default',
  version       INT             NOT NULL DEFAULT 0 COMMENT 'Optimistic lock dokumen-level (L48 CAS)',
  finalized_at  DATETIME        NULL,
  created_by    INT             NULL,
  updated_by    INT             NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lkjip_canonical (canonical_id),
  KEY idx_lkjip_tahun  (tahun),
  KEY idx_lkjip_status (status),
  CONSTRAINT fk_lkjip_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lkjip_updated FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — header dokumen laporan kinerja tahunan';

CREATE TABLE IF NOT EXISTS lkjip_section (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dokumen_id  BIGINT UNSIGNED NOT NULL,
  parent_id   BIGINT UNSIGNED NULL COMMENT 'Induk; NULL = level Bab (depth 0). Tanpa FK (self-ref cascade ditangani app)',
  depth       TINYINT         NOT NULL DEFAULT 0 COMMENT '0-5; divalidasi vs parent',
  urutan      INT             NOT NULL DEFAULT 0 COMMENT 'Posisi antar-saudara (renumber server-side)',
  judul       VARCHAR(255)    NOT NULL,
  locked      TINYINT         NOT NULL DEFAULT 0 COMMENT '1 = node bawaan seed (Bab I-IV), tak bisa hapus/pindah',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lks_dok_parent (dokumen_id, parent_id, urutan),
  KEY idx_lks_dok_depth  (dokumen_id, depth),
  CONSTRAINT fk_lks_dokumen FOREIGN KEY (dokumen_id) REFERENCES lkjip_dokumen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — node pohon kerangka (adjacency list). Nomor dihitung, tidak disimpan';

CREATE TABLE IF NOT EXISTS lkjip_block (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id  BIGINT UNSIGNED NOT NULL,
  urutan      INT             NOT NULL DEFAULT 0,
  tipe        ENUM('NARASI','TABEL','GAMBAR') NOT NULL,
  payload     JSON            NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lkb_section (section_id, urutan),
  CONSTRAINT fk_lkb_section FOREIGN KEY (section_id) REFERENCES lkjip_section(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — blok isi tiap section (NARASI/TABEL/GAMBAR)';

INSERT IGNORE INTO app_config (`key`, value) VALUES ('app_status_lkjip', 'online');
