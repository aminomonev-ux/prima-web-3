-- migration-pk-dokumen-version.sql — 2026-09-30 (audit sistem, I4)
--
-- Kunci versi (optimistic lock, L48) untuk dokumen PK. Dulu PATCH menulis ulang header
-- + seluruh lampiran/anggaran tanpa bertanya apakah dokumennya sudah diubah orang lain
-- sejak dibuka — dua penyunting, yang terakhir menang dan kerja yang pertama hilang
-- tanpa pesan.
--
-- `updated_at` tidak bisa dipakai sebagai gantinya: kolom itu hanya bergerak kalau ada
-- kolom `pk_dokumen` yang nilainya berubah, padahal simpanan yang paling sering justru
-- hanya mengganti baris lampiran/anggaran — dan presisinya cuma per detik.
--
-- Dokumen lama mulai dari 0; layar membaca angkanya dari GET, jadi tidak ada data yang
-- perlu diisi mundur.

ALTER TABLE pk_dokumen ADD COLUMN version INT NOT NULL DEFAULT 0 AFTER status;
