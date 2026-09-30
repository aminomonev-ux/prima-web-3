-- migration-pagu-blud-per-tahun.sql — 2026-09-30 (audit sistem, B5)
--
-- Pagu BLUD modul Usulan pindah dari SATU angka (`app_config.pagu_blud`) ke satu angka
-- per tahun anggaran (`pagu_blud_{tahun}`, mis. `pagu_blud_2026`). Dulu satu angka
-- dibandingkan dengan nilai usulan SEMUA tahun, jadi "Melebihi pagu" makin sering palsu
-- tiap tahun berganti. Sekarang batang pagu membandingkan pagu tahun X dengan usulan
-- tahun X, dan saat saringan "semua tahun" batangnya tidak ditampilkan.
--
-- Keputusan pemilik aplikasi (29 Sep): nilai yang ada sekarang = pagu TA 2026.
--
-- Kunci lama dibuang di berkas yang sama: kode baru tidak lagi membacanya, dan dua tempat
-- untuk satu angka cepat atau lambat berbeda pendapat (pola migration-drop-is-latest.sql).
-- Jalankan BERSAMA naiknya kode baru — sebelum itu layar lama menulis "Pagu belum diatur",
-- sesudah kode naik tanpa berkas ini layar baru menulis "Pagu TA 2026 belum diatur".
--
-- Aman dijalankan ulang: INSERT IGNORE tidak menimpa pagu 2026 yang sudah diatur lewat
-- layar baru, dan DELETE tidak menghapus apa pun kalau kunci lama sudah tidak ada.

INSERT IGNORE INTO app_config (`key`, value, updated_at)
SELECT 'pagu_blud_2026', value, NOW()
  FROM app_config
 WHERE `key` = 'pagu_blud' AND value <> '';

DELETE FROM app_config WHERE `key` = 'pagu_blud';

-- Periksa sesudahnya:
--   SELECT `key`, value FROM app_config WHERE `key` LIKE 'pagu_blud%';
