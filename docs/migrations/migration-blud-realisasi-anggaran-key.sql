-- migration-blud-realisasi-anggaran-key.sql
-- Jangkar stabil baris anggaran lintas-versi — fondasi modul Realisasi BLUD.
-- Konsep: docs/CONCEPT-blud-realisasi.md §2.3 & §6.1
--
-- Sebab: dpa_blud & pergeseran_dpa disimpan replace-all per versi (DELETE + INSERT),
-- dan row_id unik PER VERSI. Realisasi tidak boleh menempel ke id/row_id — begitu
-- versi baru disimpan, tautannya putus. anggaran_key dibuat sekali saat baris lahir
-- dan ikut terbawa saat versi disalin maupun saat inject DPA -> Pergeseran.
--
-- NULL diizinkan: baris lama yang identitasnya ambigu SENGAJA dibiarkan NULL,
-- bukan ditebak (lihat scripts/backfill-anggaran-key.mjs).
--
-- MySQL 8.4 — TANPA IF NOT EXISTS pada ADD COLUMN (aturan CLAUDE.md).
--
-- URUTAN JALAN:
--   1) node scripts/backfill-anggaran-key.mjs          -> LAPORAN, DB tidak disentuh
--   2) tinjau laporannya (baris ambigu wajib dibaca manusia)
--   3) jalankan file migrasi ini
--   4) node scripts/backfill-anggaran-key.mjs --apply  -> isi key baris lama
--   5) node scripts/backfill-anggaran-key.mjs          -> laporan ulang, pastikan 0 baris kehilangan key

-- 1) DPA
ALTER TABLE dpa_blud
  ADD COLUMN anggaran_key VARCHAR(64) NULL
  COMMENT 'Identitas stabil baris anggaran lintas-versi (jangkar realisasi)' AFTER row_id;

ALTER TABLE dpa_blud
  ADD INDEX idx_anggaran_key (tahun_anggaran, anggaran_key);

-- 2) Pergeseran — key SAMA dengan baris DPA asalnya, supaya pagu efektif & realisasi
--    menunjuk jangkar yang sama walau pagunya diambil dari versi pergeseran terbaru.
ALTER TABLE pergeseran_dpa
  ADD COLUMN anggaran_key VARCHAR(64) NULL
  COMMENT 'Identitas stabil baris anggaran lintas-versi (jangkar realisasi)' AFTER row_id;

ALTER TABLE pergeseran_dpa
  ADD INDEX idx_anggaran_key (tahun_anggaran, anggaran_key);
