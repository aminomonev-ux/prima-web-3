-- migration-audit-target-user.sql
-- Tahap 7 · P8 lapis 1 (menutup T-15). Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P8.
--
-- `audit_log.username` menyimpan PELAKU. Sasarannya — siapa yang dikenai — tenggelam di
-- `detail` sebagai teks bebas: "Ubah role user id=12". Akibatnya pertanyaan yang paling
-- sering ditanyakan saat ada masalah, "akses Sari pernah diubah siapa dan kapan?", tidak
-- bisa dijawab dari layar mana pun: penyaring tab Jejak Audit cuma `event_type`, nama
-- pelaku, dan tanggal.
--
-- Dan mencarinya manual pun jebakan: `detail LIKE '%id=12%'` ikut cocok dengan `id=120`,
-- `id=123`, `id=127`. Pencarian yang kelihatan berhasil dan diam-diam salah — jenis
-- kesalahan yang paling sulit ketahuan, karena hasilnya tetap masuk akal.
--
-- Satu kolom + satu indeks. Kolomnya NULL untuk peristiwa yang memang tidak mengenai
-- siapa-siapa (LOGIN_SUCCESS, CONFIG_UPDATE, BLUD_SAVE_DPA, …) — dan itu bukan
-- kekurangan data, itu jawaban yang benar.
--
-- TANPA FOREIGN KEY, dan itu disengaja. `ON DELETE SET NULL` akan MENGHAPUS jawabannya
-- persis pada kasus yang paling perlu dijawab ("akun itu dihapus, siapa yang
-- menghapusnya dan kenapa?"), sedangkan `CASCADE` akan membuang baris auditnya sama
-- sekali. Jejak audit harus bertahan melewati orang yang dijejaknya; id yatim di sini
-- lebih berguna daripada NULL yang rapi.
--
-- Indeksnya (target_user_id, created_at DESC) — dua kolom, bukan satu: garis waktu satu
-- orang SELALU dibaca terurut waktu terbaru, jadi indeks satu kolom tetap menyisakan
-- filesort di atas ribuan baris.
--
-- Baris LAMA tetap NULL. Tidak ada backfill, dan itu keputusan: menerka sasaran dari
-- `detail LIKE '%id=N%'` adalah persis pencarian salah yang migrasi ini ada untuk
-- membuangnya. Garis waktu berumur maju dari hari ini — dan layarnya WAJIB
-- mengatakannya, bukan membiarkan orang mengira riwayatnya lengkap.
--
-- Aman dijalankan pada basis data yang sudah punya kolomnya? TIDAK — MySQL menjawab
-- ER_DUP_FIELDNAME (1060). PERIKSA DULU (harus memulangkan 0 baris):
--
--   SELECT COLUMN_NAME FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log'
--     AND COLUMN_NAME = 'target_user_id';
--
--   SHOW INDEX FROM audit_log WHERE Key_name = 'idx_audit_log_target';

ALTER TABLE audit_log
  ADD COLUMN target_user_id INT DEFAULT NULL COMMENT 'Siapa yang DIKENAI (T-15). NULL = peristiwa ini tidak mengenai orang tertentu.';

CREATE INDEX idx_audit_log_target ON audit_log (target_user_id, created_at DESC);
