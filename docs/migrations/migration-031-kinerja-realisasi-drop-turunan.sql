-- Migration 031: Checkpoint D — DROP kolom turunan kinerja_realisasi
-- Tanggal: 2026-05-27
-- Reference: docs/lain/KINERJA_VERSI_REFACTOR.md (Checkpoint D)
-- Prerequisite: 0 orphan rows verified — query:
--   SELECT COUNT(*) FROM kinerja_realisasi r
--   WHERE NOT EXISTS (SELECT 1 FROM kinerja_ssk s
--     WHERE s.canonical_id = r.ssk_canonical_id
--       AND s.tahun = r.tahun AND s.sumber = r.sumber);
--
-- Setelah migration ini:
--   - real_fisik & real_keuangan tetap = SATU-SATUNYA input persisten user
--   - Semua kolom % dan akumulasi DIHITUNG server-side via recalcAllRealisasiServer
--     berdasarkan SSK versi aktif (canonical_id lookup) — tidak ada fallback ke
--     snapshot DB karena snapshot sudah dihapus.
--   - Save jadi lebih ringan (12 kolom DECIMAL berkurang dari INSERT batch)

ALTER TABLE kinerja_realisasi
  DROP COLUMN pagu_awal,
  DROP COLUMN target_fisik,
  DROP COLUMN pct_fisik,
  DROP COLUMN akum_target_fisik,
  DROP COLUMN akum_real_fisik,
  DROP COLUMN akum_pct_fisik,
  DROP COLUMN akum_keuangan,
  DROP COLUMN akum_pct_keuangan,
  DROP COLUMN deviasi_fisik,
  DROP COLUMN deviasi_keuangan;
