-- migration-pergeseran-uraian-geser.sql
-- Kolom `bertambah` + `berkurang` pada pergeseran_dpa.
-- Konsep: docs/CONCEPT-blud-uraian-geser.md
--
-- KENAPA: kolom `bertambah_berkurang` cuma SATU angka bertanda, hasil hitungan
-- `pergeseran - jumlah`. Rekening yang ditambah DAN dikurangi di dokumen yang
-- sama kehilangan separuh ceritanya — ATK yang menerima 45jt lalu melepas 12jt
-- terbaca "+33jt", seolah cuma kebagian. Angka 45 dan 12 itu keputusan manusia
-- dan tidak bisa dihitung dari mana pun: dari 80jt ke 113jt, tidak ada cara tahu
-- itu "+45 -12" atau "+33" atau "+70 -37". Jadi harus bisa diketik.
--
-- NULL = "belum diuraikan, turunkan dari selisih". Bukan data hilang — itu
-- keadaan NORMAL untuk mayoritas baris, dan dua hal bergantung padanya:
--
--   1. `recalcPergeseranJumlah` menulis `bertambah_berkurang` TANPA SYARAT tiap
--      kali tabel dihitung ulang (tiap ketikan). Kalau kolom ini diperlakukan
--      sama, angka 45/12 yang diketik akan tertimpa jadi 33/0 begitu pemakai
--      menyentuh sel lain — tanpa pesan. NULL yang membedakan "isi sendiri" dari
--      "jangan disentuh".
--
--   2. 50 snapshot `blud_riwayat_simpan` + berkas cadangan Drive dibuat SEBELUM
--      kolom ini ada. Kalau kolomnya wajib, memulihkan salah satunya lalu Simpan
--      ditolak Zod — seluruh riwayat jadi tak terpakai, persis saat paling
--      dibutuhkan.
--
-- Nilai turunannya SENGAJA tidak ikut disimpan. Preseden: `is_latest` dibuang
-- (migration-drop-is-latest.sql) justru karena dua sumber kebenaran soal angka
-- uang cepat atau lambat berbeda pendapat. Yang disimpan hanya uraian TANGAN;
-- sisanya dihitung saat dipakai oleh `uraiGeser()` di lib/blud/urai-geser.ts.
--
-- Baris INDUK tidak pernah menyimpan uraian — angkanya dijumlah dari anak, sama
-- seperti `pergeseran`. Dan karena ikut digulung, tiap layar yang menampilkan
-- daftar rekening WAJIB menyaring baris daun (L85), kalau tidak 45jt yang sama
-- muncul berlapis sedalam pohonnya.
--
-- AMAN untuk data lama: kolom lahir NULL, jadi tiap baris yang sudah ada
-- menampilkan persis seperti sebelumnya. Nol backfill. Uraian dua arah berlaku
-- untuk pergeseran SEJAK fitur ini hidup — yang lama memang tidak pernah
-- mencatatnya, jadi tidak ada yang bisa dipulihkan.
--
-- DECIMAL(18,2) mengikuti `bertambah_berkurang` persis.

ALTER TABLE pergeseran_dpa
  ADD COLUMN bertambah DECIMAL(18,2) NULL DEFAULT NULL
    COMMENT 'Uraian tangan: bagian yang MASUK. NULL = belum diuraikan, turunkan dari selisih'
    AFTER bertambah_berkurang,
  ADD COLUMN berkurang DECIMAL(18,2) NULL DEFAULT NULL
    COMMENT 'Uraian tangan: bagian yang KELUAR. NULL = belum diuraikan'
    AFTER bertambah;
