-- Migration: Hapus sub-tab sumber (GAJI/BLUD/HARLEP/PROMKES/SARPRAS) dari master uraian_ssk
-- Uraian SSK kini tidak dikelompokkan per sumber, sumber = NULL untuk semua row tipe uraian_ssk
-- Jika ada duplikat nama dalam satu tahun (dari sumber berbeda), data lama akan dikonsolidasi
-- Jalankan sekali saat deploy

-- 1. Hapus duplikat: pertahankan id terkecil per (tahun, nama, program_ref, kegiatan_ref, subkegiatan_ref)
DELETE FROM kinerja_master
WHERE tipe = 'uraian_ssk'
  AND id NOT IN (
    SELECT MIN(id)
    FROM kinerja_master
    WHERE tipe = 'uraian_ssk'
    GROUP BY tahun, nama, COALESCE(program_ref,''), COALESCE(kegiatan_ref,''), COALESCE(subkegiatan_ref,'')
  );

-- 2. Set sumber = NULL untuk semua row uraian_ssk yang tersisa
UPDATE kinerja_master
SET sumber = NULL
WHERE tipe = 'uraian_ssk';
