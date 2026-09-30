-- migration-kinerja-master-idx-subkegiatan.sql — 2026-09-30 (audit sistem, U4)
--
-- `idx_km_subkegiatan_ref` dibuat oleh migration-kinerja-master-hierarki-ref.sql (baris
-- terakhirnya), tapi tidak pernah ditulis di docs/schema-mysql.sql — jadi basis data yang
-- lahir dari skema acuan berdiri tanpa indeks ini, dan DB pengembang memang tidak punya.
-- Bentuknya disamakan dengan saudaranya `idx_km_kegiatan_ref` (awalan 100 karakter).
--
-- Kalau indeksnya sudah ada (migrasi lama pernah jalan penuh), MySQL menjawab
-- ER_DUP_KEYNAME (1061) — aman diabaikan.

CREATE INDEX idx_km_subkegiatan_ref ON kinerja_master (subkegiatan_ref(100));
