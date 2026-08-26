-- migration-drop-is-latest.sql
-- Buang kolom `is_latest` dari dpa_blud & pergeseran_dpa.
--
-- ALASAN: kolom ini TIDAK PERNAH DITULIS. Ia tidak ada di `DPA_COLUMNS` maupun
-- `PERGESERAN_COLUMNS` (lib/blud/data.ts), jadi setiap baris yang masuk memakai
-- DEFAULT 1 dan tidak ada yang pernah menurunkannya jadi 0. Hasilnya SETIAP baris
-- di SETIAP versi mengaku versi terbaru. Contoh nyata, DPA 2026 sebelum migration:
--
--   versi 2026-08-26 (terbaru)  558 baris  is_latest = 1
--   versi 2026-08-05 (lama)     558 baris  is_latest = 1
--   versi 2026-07-26 (lama)      12 baris  is_latest = 1
--
-- Hari ini tidak ada gejala: tak satu pun query memakainya (`WHERE is_latest`
-- nihil di seluruh repo), dan lencana LATEST di layar dihitung klien dari daftar
-- riwayat. Bahayanya menunggu — `WHERE is_latest = 1` terbaca benar, jalan tanpa
-- galat, lalu memulangkan SEMUA versi tercampur. Kalau itu dipakai menghitung
-- pagu, angkanya salah tanpa ada yang bersuara.
--
-- Kenapa dibuang, bukan dipelihara: pertanyaan "versi mana yang berlaku" SUDAH
-- terjawab benar lewat MAX(versi_tanggal). Memelihara kolom ini berarti punya dua
-- sumber kebenaran untuk satu pertanyaan tentang angka uang, dan dua sumber
-- kebenaran cepat atau lambat akan berbeda pendapat.
--
-- INDEX ikut dibuang, bukan dibiarkan menyusut sendiri. Kalau kolomnya saja yang
-- dihapus, MySQL diam-diam menyisakan `idx_versi_latest (versi_tanggal)` — nama
-- yang berbohong tentang isinya, dan lagi pula `idx_urutan (versi_tanggal, urutan)`
-- sudah melayani pencarian per versi_tanggal lewat awalannya.
--
-- AMAN DIJALANKAN KAPAN SAJA. Kode sudah berhenti membaca kolom ini lebih dulu
-- (`normDpa`/`normPergeseran` + tipe `DpaBaris`/`PergeseranBaris`), dan query
-- pembacanya memakai SELECT * — jadi ada atau tidak ada kolomnya, hasilnya sama.
--
-- Referensi: L75 (catatan sampingan) di docs/AUDIT-LESSONS-LEARNED.md

ALTER TABLE dpa_blud       DROP INDEX  idx_versi_latest;
ALTER TABLE dpa_blud       DROP COLUMN is_latest;

ALTER TABLE pergeseran_dpa DROP INDEX  idx_versi_latest;
ALTER TABLE pergeseran_dpa DROP COLUMN is_latest;
