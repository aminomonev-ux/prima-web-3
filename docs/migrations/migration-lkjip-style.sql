-- ═══════════════════════════════════════════════════════════════════════════
-- Migration — LKJIP style_config (Item 3: formatting Word)
-- Tambah kolom JSON untuk default gaya dokumen (font, ukuran, spasi, perataan).
-- Dipakai generator Word → styles.xml docDefaults + Normal.
-- MySQL 8.4 — tanpa IF NOT EXISTS pada ADD COLUMN.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE lkjip_dokumen
  ADD COLUMN style_config JSON NULL AFTER nomor_config;
