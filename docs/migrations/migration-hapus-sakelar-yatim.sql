-- migration-hapus-sakelar-yatim.sql — Fase F Tahap 0 (docs/CONCEPT-perbaikan-audit-akses.md).
--
-- Tiga kunci sakelar tanpa modul. Tidak ada di registry (`lib/registry/apps-data.mjs`),
-- tidak dibaca satu berkas kode pun, dan GET /api/admin/app-status menyaringnya lewat
-- daftar registry — jadi nilainya tidak pernah berpengaruh apa pun. `app_status_kinerja`
-- sisa migration-kinerja.sql; modul E-Anggaran sekarang memakai `app_status_new_econtrolling`.
--
-- Dibuang supaya daftar `app_config` sama dengan daftar sakelar yang benar-benar ada:
-- baris yatim bernilai 'maintenance' terbaca seperti modul yang sedang dimatikan
-- oleh siapa pun yang memeriksa tabelnya langsung.
--
-- Aman dijalankan berulang (DELETE atas baris yang tidak ada = 0 baris).

DELETE FROM app_config
WHERE `key` IN (
  'app_status_jp_renbang', 'app_status_jp_renbang_pesan', 'app_status_jp_renbang_sampai',
  'app_status_kinerja',    'app_status_kinerja_pesan',    'app_status_kinerja_sampai',
  'app_status_probis',     'app_status_probis_pesan',     'app_status_probis_sampai'
);
