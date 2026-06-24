-- migration-rename-buku-besar-aset.sql
-- Rename modul "Inventaris (Belanja) Modal" → "Buku Besar Aset" (BBA).
-- Mengubah: tabel, app-status flag (app_config), app_access key (users JSON),
-- dan prefix canonical_id IM- → BBA- agar tidak belang.
-- MySQL 8.4. Jalankan sekali. Idempotent-safe via guard WHERE.

-- 1) Rename tabel. Self-FK (parent_row_id) otomatis ikut ke nama baru.
RENAME TABLE inventaris_modal TO buku_besar_aset;

-- 2) Rename app-status flag key di app_config.
UPDATE app_config
SET `key` = 'app_status_buku_besar_aset'
WHERE `key` = 'app_status_inventaris_modal';

-- 3) Rename app_access key 'inventaris_modal' → 'buku_besar_aset' di JSON array tiap user.
--    Hanya baris yang punya elemen tsb (JSON_SEARCH non-null).
UPDATE users
SET app_access = JSON_REPLACE(
      app_access,
      JSON_UNQUOTE(JSON_SEARCH(app_access, 'one', 'inventaris_modal')),
      'buku_besar_aset')
WHERE JSON_SEARCH(app_access, 'one', 'inventaris_modal') IS NOT NULL;

-- 4) Migrasi prefix canonical_id existing IM-NNNNNN → BBA-NNNNNN (anti-belang).
--    UNIQUE(canonical_id, tahun_anggaran) tetap aman (prefix konsisten).
UPDATE buku_besar_aset
SET canonical_id = CONCAT('BBA-', SUBSTRING(canonical_id, 4))
WHERE canonical_id LIKE 'IM-%';
