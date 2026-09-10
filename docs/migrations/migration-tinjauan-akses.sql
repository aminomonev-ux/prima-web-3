-- migration-tinjauan-akses.sql
-- Tahap 8 · P3 Tinjauan Akses Berkala. Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P3.
--
-- CLAUDE.md (AUTHZ-02/V5) sudah menyatakan akses harus **direview berkala**. Tidak ada
-- alatnya, tidak ada catatannya, dan karena itu tidak pernah terjadi. Kalau SPI atau
-- auditor bertanya "kapan terakhir ditinjau", tidak ada jawaban — bukan jawaban yang
-- buruk, tapi tidak ada sama sekali.
--
-- Dua kolom, dan sengaja BUKAN tabel riwayat tinjauan. Yang dibutuhkan "kapan terakhir",
-- bukan seluruh sejarahnya — dan sejarahnya toh sudah masuk `audit_log` sejak Tahap 7,
-- lengkap dengan siapa yang meninjau dan kapan. Tabel kedua berarti dua sumber kebenaran
-- untuk satu tanggal, dan yang satu pasti mulai berbeda dari yang lain.
--
-- `access_reviewed_by` ber-FK `ON DELETE SET NULL`, BEDA dari `audit_log.target_user_id`
-- yang sengaja tanpa FK. Alasannya berlawanan arah dan dua-duanya benar: di audit yang
-- dijaga adalah RIWAYAT (harus bertahan melewati orang yang dijejaknya), di sini yang
-- dijaga KEADAAN SEKARANG ("siapa peninjau terakhir") — dan peninjau yang akunnya sudah
-- dihapus lebih jujur ditulis NULL daripada id yang tidak menunjuk siapa-siapa.
--
-- Tanpa nilai awal: setiap akun mulai dari "belum pernah ditinjau", dan itu memang
-- keadaan yang sebenarnya. Mengisinya dengan tanggal migrasi akan membuat seluruh akun
-- tampak baru ditinjau hari ini — bukti palsu, dan justru pada kolom yang seluruh
-- gunanya adalah jadi bukti.
--
-- Aman dijalankan pada basis data yang sudah punya kolomnya? TIDAK — MySQL menjawab
-- ER_DUP_FIELDNAME (1060). PERIKSA DULU (harus memulangkan 0 baris):
--
--   SELECT COLUMN_NAME FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
--     AND COLUMN_NAME IN ('access_reviewed_at', 'access_reviewed_by');

ALTER TABLE users
  ADD COLUMN access_reviewed_at DATETIME DEFAULT NULL COMMENT 'Kapan wewenangnya terakhir ditinjau (P3). NULL = belum pernah.',
  ADD COLUMN access_reviewed_by INT      DEFAULT NULL COMMENT 'Siapa yang meninjau terakhir.',
  ADD CONSTRAINT fk_users_reviewed_by FOREIGN KEY (access_reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- Penyaring utama layarnya "belum ditinjau / sudah lewat 6 bulan", jadi yang dibaca
-- justru baris ber-NULL dan yang paling tua. Indeksnya menaik: NULL lebih dulu di MySQL.
CREATE INDEX idx_users_reviewed ON users (access_reviewed_at);
