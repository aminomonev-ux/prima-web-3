-- migration-blud-flag-realisasi.sql — temuan audit S4
--
-- `BLUD_REALISASI_APP_FLAG` sudah dideklarasikan di kode dan disebut di konsep,
-- tapi barisnya tidak pernah ada di `app_config` dan tidak pernah dibaca route
-- mana pun. Sekarang dibaca — jadi barisnya harus ada, kalau tidak sakelarnya
-- tidak muncul di Admin Panel.
--
-- 'online' = hidup. Nilai apa pun selain itu berarti mati (503 di API, layar
-- dilempar ke /maintenance). Sengaja begitu: salah ketik lebih baik menutup
-- daripada diam-diam membuka.
--
-- Berjenjang: 'app_status_blud' mati → Realisasi ikut mati. Sebaliknya tidak.

INSERT IGNORE INTO app_config (`key`, value) VALUES
  ('app_status_blud_realisasi', 'online');

-- Jaring pengaman: kalau instalasi lama belum punya baris induknya sekalipun.
INSERT IGNORE INTO app_config (`key`, value) VALUES
  ('app_status_blud', 'online');
