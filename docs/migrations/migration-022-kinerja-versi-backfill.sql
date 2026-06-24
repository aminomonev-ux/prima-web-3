-- migration-022-kinerja-versi-backfill.sql
-- Tahap Versi E-Anggaran — Checkpoint A Task #10
-- Backfill data existing → versi MURNI seq=0, generate canonical_id, link Realisasi.
-- Reference: docs/lain/KINERJA_VERSI_REFACTOR.md

-- ─── 1. Assign canonical_id ke SSK existing ─────────────────────────────────
-- Pattern: 'K-' + LPAD(id,6,'0') — stabil, mudah trace ke id asli.
-- Default versi_tipe='MURNI', versi_seq=0 sudah otomatis dari migration-020.
UPDATE kinerja_ssk
SET canonical_id = CONCAT('K-', LPAD(id, 6, '0'))
WHERE canonical_id = '';

-- ─── 2. Link Realisasi → SSK canonical_id ───────────────────────────────────
-- Match by (tahun, sumber, uraian_ssk, uraian/keterangan) ke SSK versi MURNI.
-- Default ssk_versi_tipe='MURNI', ssk_versi_seq=0 sudah otomatis dari migration-021.
UPDATE kinerja_realisasi r
JOIN kinerja_ssk s
  ON s.tahun       = r.tahun
 AND s.sumber      = r.sumber
 AND s.versi_tipe  = 'MURNI'
 AND s.versi_seq   = 0
 AND COALESCE(s.uraian_ssk, '') = COALESCE(r.uraian_ssk, '')
 AND s.uraian      = r.keterangan
SET r.ssk_canonical_id = s.canonical_id
WHERE r.ssk_canonical_id = '';

-- ─── 3. Sekarang aman tambah UNIQUE KEY (semua canonical_id sudah terisi) ──
ALTER TABLE kinerja_ssk
  ADD UNIQUE KEY uq_ks_canonical_versi (tahun, sumber, canonical_id, versi_tipe, versi_seq);

-- ─── 4. Verifikasi ──────────────────────────────────────────────────────────
-- Setelah jalankan migration ini, jalankan query verifikasi:
--   SELECT COUNT(*) FROM kinerja_ssk WHERE canonical_id = '';
--     -- expected: 0
--   SELECT COUNT(*) FROM kinerja_realisasi WHERE ssk_canonical_id = '';
--     -- expected: 0 (kecuali ada row realisasi tanpa pasangan SSK — investigate)
--   SELECT COUNT(DISTINCT canonical_id) FROM kinerja_ssk;
--     -- expected: = COUNT(*) kinerja_ssk (1 canonical per row di versi MURNI)
