-- ─── Migration 028: Retention Policy + Soft Delete (SDL-L5) ──────────────────
-- UU PDP Pasal 16 + ISO 27001 A.5.34 compliance.
-- Idempotent: cek INFORMATION_SCHEMA dulu sebelum ALTER (MySQL 8.4 strict).
--
-- Cara apply:
--   mysql -u root -p prima_db < docs/migrations/migration-028-retention-policy.sql
--
-- Setelah apply: setup cron mingguan untuk panggil POST /api/cron/purge-retention
-- (lihat handler di app/api/cron/purge-retention/route.ts).

-- ─── 1. Tambah kolom users.deleted_at (soft delete) ─────────────────────────
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deleted_at'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN deleted_at DATETIME DEFAULT NULL AFTER updated_at',
  'SELECT "users.deleted_at sudah ada — skip" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index untuk query soft-deleted users (cron purge)
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_deleted_at'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_users_deleted_at ON users (deleted_at)',
  'SELECT "idx_users_deleted_at sudah ada — skip" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 2. Dokumentasi retention queries (DIJALANKAN VIA CRON) ──────────────────
-- Tabel: audit_log (Retention 12 bulan)
-- DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL 12 MONTH;
--
-- Tabel: user_sessions (Retention 90 hari pasca-invalidate)
-- DELETE FROM user_sessions WHERE invalidated_at IS NOT NULL AND invalidated_at < NOW() - INTERVAL 90 DAY;
--
-- Tabel: notifications (Retention 6 bulan untuk yang sudah dibaca, 12 bulan untuk unread)
-- DELETE FROM notifications WHERE dibaca = TRUE  AND created_at < NOW() - INTERVAL 6 MONTH;
-- DELETE FROM notifications WHERE dibaca = FALSE AND created_at < NOW() - INTERVAL 12 MONTH;
--
-- Tabel: users (anonimisasi setelah 5 tahun NONAKTIF, bukan hard delete — preserve FK)
-- UPDATE users SET
--   email = CONCAT('deleted-', id, '@anonymized.local'),
--   nama_lengkap = NULL,
--   reset_token = NULL,
--   email_verify_token = NULL,
--   deleted_at = NOW()
-- WHERE status = 'NONAKTIF'
--   AND deleted_at IS NULL
--   AND updated_at < NOW() - INTERVAL 5 YEAR;

-- ─── Status ──────────────────────────────────────────────────────────────────
SELECT 'Migration 028 selesai. Setup Vercel cron untuk POST /api/cron/purge-retention mingguan.' AS status;
