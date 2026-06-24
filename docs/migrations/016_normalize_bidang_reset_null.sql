-- O6: Normalize sentinel `bidang_by != ''` inkonsisten.
-- Schema (schema-mysql.sql:124-127) sudah DEFAULT NULL, tapi kode resubmit
-- revisi bidang di `app/api/usulan/[id]/route.ts:183` set ke empty string ''.
-- Filter di `app/api/usulan/route.ts:65,73` dan `[id]/route.ts:128` jadi pakai
-- `IS NOT NULL AND != ''` untuk handle dua-duanya.
--
-- Fix: normalize legacy data ke NULL supaya filter cukup `IS NULL`/`IS NOT NULL`
-- (lebih bersih, sargable, sesuai schema default).
--
-- Idempotent: aman dijalankan berulang (UPDATE no-op kalau sudah NULL).

UPDATE usulan_items
SET bidang_by        = NULL,
    bidang_keputusan = NULL,
    bidang_catatan   = NULL
WHERE bidang_by = ''
   OR bidang_keputusan = ''
   OR bidang_catatan   = '';
