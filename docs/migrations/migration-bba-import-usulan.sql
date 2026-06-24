-- ════════════════════════════════════════════════════════════════════════════
-- Migration: BBA ← Import Belanja Modal dari Usulan Kebutuhan
-- Konsep: docs/session/buku-besar-aset/CONCEPT-import-usulan.md
-- Kolom provenance asal-usulan + unit realisasi (vol_realisasi).
-- UNIQUE usulan_item_id = anti double-entry (1 item usulan = 1 baris BBA);
-- NULL boleh banyak (baris MANUAL).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE buku_besar_aset
  ADD COLUMN origin           ENUM('MANUAL','USULAN') NOT NULL DEFAULT 'MANUAL' AFTER tahun_anggaran,
  ADD COLUMN usulan_item_id   INT NULL AFTER origin,
  ADD COLUMN usulan_no        VARCHAR(30) NULL AFTER usulan_item_id,
  ADD COLUMN usulan_keputusan ENUM('DISETUJUI','DITOLAK') NULL AFTER usulan_no,
  ADD COLUMN ditolak_oleh     ENUM('ADMIN','KASUBAG','KABAG') NULL AFTER usulan_keputusan,
  ADD COLUMN sub_bidang       VARCHAR(50) NULL AFTER ditolak_oleh,
  ADD COLUMN vol_realisasi    DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER nilai_realisasi,
  ADD UNIQUE KEY uq_bba_usulan_item (usulan_item_id);
