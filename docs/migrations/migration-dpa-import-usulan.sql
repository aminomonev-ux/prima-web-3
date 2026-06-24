-- Migration: Import Usulan Kebutuhan -> Form DPA BLUD (jejak asal-usul baris)
-- Ref: docs/session/blud/CONCEPT-import-usulan-dpa.md §4
-- BUKAN UNIQUE (beda BBA): dpa_blud versioned snapshot — item sama wajar ada di
-- beberapa versi. Keunikan ditegakkan per-versi di level aplikasi (Sentinel Guard).

ALTER TABLE dpa_blud
  ADD COLUMN origin ENUM('MANUAL','USULAN') NOT NULL DEFAULT 'MANUAL' COMMENT 'Asal baris: input manual atau import usulan',
  ADD COLUMN usulan_item_id INT NULL COMMENT 'FK soft ke usulan_items.id (jejak import)',
  ADD COLUMN usulan_no VARCHAR(64) NULL COMMENT 'No usulan asal (display/trace)';

ALTER TABLE dpa_blud ADD INDEX idx_dpa_usulan_item (usulan_item_id);
