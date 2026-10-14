-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: realisasi triwulan Renaksi boleh NULL (2026-10-14)
--
-- q1..q4_realisasi dulu NOT NULL DEFAULT 0, jadi "belum diisi" dan "nol sungguhan"
-- tidak bisa dibedakan di level tanpa realisasi bulanan (tujuan/sasaran/program/
-- kegiatan). Untuk Progres Negatif nol = capaian TERBAIK (200%): layar terpaksa
-- membaca 0 sebagai "belum diisi" ("—"), sehingga indikator yang realisasinya
-- memang 0 (mis. Net Death Rate) tidak pernah tercatat 200%.
-- Kini NULL = belum diisi, 0 = nol nyata — arti yang sama dengan null di
-- `bulan_realisasi` (R3). Target triwulan TETAP NOT NULL.
--
-- Backfill mempertahankan arti lama: 0 yang tersimpan sebelum migrasi ini memang
-- dibaca "belum diisi" oleh layar, jadi diubah ke NULL — KECUALI triwulan yang
-- bulan-bulannya terisi (realisasi bulanan sub-kegiatan; di sana 0 sudah bisa
-- berarti nol nyata). `updated_at` sengaja dipertahankan: isinya tidak berubah arti.
--
-- WAJIB dijalankan sebelum kodenya dipasang: kode baru menulis NULL saat Reset
-- Realisasi / modal triwulan dikosongkan, dan kolom NOT NULL menolaknya.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE rencana_aksi
  MODIFY q1_realisasi DECIMAL(14,2) NULL DEFAULT NULL,
  MODIFY q2_realisasi DECIMAL(14,2) NULL DEFAULT NULL,
  MODIFY q3_realisasi DECIMAL(14,2) NULL DEFAULT NULL,
  MODIFY q4_realisasi DECIMAL(14,2) NULL DEFAULT NULL;

-- Bulan ke-i (0..11) "terisi" bila:
--   format v2 {"v":2,"m":[…]} → elemen m[i] ada dan bukan JSON null, atau
--   format lama larik polos     → elemen [i] > 0 (konvensi lama: 0 = belum diisi).
UPDATE rencana_aksi SET q1_realisasi = NULL, updated_at = updated_at
WHERE q1_realisasi = 0 AND NOT (bulan_realisasi IS NOT NULL AND (
     COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[0]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[1]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[2]')), 'NULL') <> 'NULL'
  OR (JSON_TYPE(bulan_realisasi) = 'ARRAY' AND (
       COALESCE(JSON_EXTRACT(bulan_realisasi, '$[0]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[1]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[2]'), 0) > 0))));

UPDATE rencana_aksi SET q2_realisasi = NULL, updated_at = updated_at
WHERE q2_realisasi = 0 AND NOT (bulan_realisasi IS NOT NULL AND (
     COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[3]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[4]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[5]')), 'NULL') <> 'NULL'
  OR (JSON_TYPE(bulan_realisasi) = 'ARRAY' AND (
       COALESCE(JSON_EXTRACT(bulan_realisasi, '$[3]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[4]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[5]'), 0) > 0))));

UPDATE rencana_aksi SET q3_realisasi = NULL, updated_at = updated_at
WHERE q3_realisasi = 0 AND NOT (bulan_realisasi IS NOT NULL AND (
     COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[6]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[7]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[8]')), 'NULL') <> 'NULL'
  OR (JSON_TYPE(bulan_realisasi) = 'ARRAY' AND (
       COALESCE(JSON_EXTRACT(bulan_realisasi, '$[6]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[7]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[8]'), 0) > 0))));

UPDATE rencana_aksi SET q4_realisasi = NULL, updated_at = updated_at
WHERE q4_realisasi = 0 AND NOT (bulan_realisasi IS NOT NULL AND (
     COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[9]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[10]')), 'NULL') <> 'NULL'
  OR COALESCE(JSON_TYPE(JSON_EXTRACT(bulan_realisasi, '$.m[11]')), 'NULL') <> 'NULL'
  OR (JSON_TYPE(bulan_realisasi) = 'ARRAY' AND (
       COALESCE(JSON_EXTRACT(bulan_realisasi, '$[9]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[10]'), 0) > 0
    OR COALESCE(JSON_EXTRACT(bulan_realisasi, '$[11]'), 0) > 0))));
