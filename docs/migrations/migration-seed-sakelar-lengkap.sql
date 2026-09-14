-- migration-seed-sakelar-lengkap.sql — Fase F Tahap 17 (T15, docs/CONCEPT-perbaikan-audit-akses.md).
--
-- Lima sakelar di registry (`lib/registry/apps.ts` → KUNCI_SAKELAR) tidak pernah diseed di
-- docs/schema-mysql.sql. Baris yang tidak ada dibaca `online`, jadi tidak ada yang rusak —
-- tapi sakelar tanpa baris tidak muncul di `scripts/cek-tahap-0.mjs` maupun kueri langsung
-- ke app_config, dan orang yang memeriksa tabel menyimpulkan sakelarnya tidak ada.
--
-- INSERT IGNORE: baris yang sudah ada (mis. sudah pernah disetel dari layar Sakelar) TIDAK
-- ditimpa. Aman diulang.

INSERT IGNORE INTO app_config (`key`, value) VALUES
  ('app_status_global',          'online'),
  ('app_status_dashboard',       'online'),
  ('app_status_buku_besar_aset', 'online'),
  ('app_status_lkjip',           'online'),
  ('app_status_sentinel_bot',    'online');
