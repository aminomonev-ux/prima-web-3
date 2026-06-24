-- migration-023-kinerja-realisasi-relink.sql
-- Hotfix Refactor Versi E-Anggaran — Checkpoint C tambahan.
--
-- Masalah: saveRealisasiBatch versi sebelum hotfix tidak include ssk_canonical_id di INSERT,
-- jadi kalau user pernah klik "Simpan Semua" di Realisasi, semua linkage canonical_id ke-wipe
-- jadi ''. Migration ini re-link berdasarkan match (uraian_ssk + keterangan) ke SSK MURNI.
--
-- Aman dijalankan multiple kali — hanya UPDATE row yang masih kosong.
-- Reference: docs/lain/KINERJA_VERSI_REFACTOR.md

UPDATE kinerja_realisasi r
JOIN kinerja_ssk s
  ON s.tahun       = r.tahun
 AND s.sumber      = r.sumber
 AND s.versi_tipe  = 'MURNI'
 AND s.versi_seq   = 0
 AND COALESCE(s.uraian_ssk, '') = COALESCE(r.uraian_ssk, '')
 AND s.uraian      = r.keterangan
SET r.ssk_canonical_id = s.canonical_id,
    r.ssk_versi_tipe   = 'MURNI',
    r.ssk_versi_seq    = 0
WHERE r.ssk_canonical_id = '' OR r.ssk_canonical_id IS NULL;

-- Verifikasi setelah jalankan migration:
--   SELECT COUNT(*) FROM kinerja_realisasi WHERE ssk_canonical_id = '';
--     -- expected: 0
--   SELECT ssk_canonical_id, COUNT(*) FROM kinerja_realisasi
--    WHERE tahun='2026' AND sumber='GAJI'
--    GROUP BY ssk_canonical_id LIMIT 5;
--     -- expected: 15 canonical_id berbeda × ~12 baris = 180 row
