-- Migration 030: Tambah 3 sub-tab sumber baru di E-Anggaran
-- Tanggal: 2026-05-27
-- Scope: extend ENUM kolom `sumber` di 5 tabel kinerja_* dengan
--        'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN' (append, additive)
-- Pattern: ALTER TABLE MODIFY COLUMN — additive, data lama aman, no backfill
-- Catatan: MySQL 8 ENUM extension dengan menambah value di akhir TIDAK
--          memerlukan table rebuild (INSTANT, no lock). Selama urutan
--          existing values tidak diubah, perubahan ini gratis.

-- ─── kinerja_master ────────────────────────────────────────────────────────
ALTER TABLE kinerja_master
  MODIFY COLUMN sumber
  ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN')
  DEFAULT NULL;

-- ─── kinerja_rekening ──────────────────────────────────────────────────────
ALTER TABLE kinerja_rekening
  MODIFY COLUMN sumber
  ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN')
  NOT NULL;

-- ─── kinerja_ssk ───────────────────────────────────────────────────────────
ALTER TABLE kinerja_ssk
  MODIFY COLUMN sumber
  ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN')
  NOT NULL;

-- ─── kinerja_realisasi_nomen ───────────────────────────────────────────────
ALTER TABLE kinerja_realisasi_nomen
  MODIFY COLUMN sumber
  ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN')
  NOT NULL;

-- ─── kinerja_realisasi ─────────────────────────────────────────────────────
ALTER TABLE kinerja_realisasi
  MODIFY COLUMN sumber
  ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN')
  NOT NULL;
