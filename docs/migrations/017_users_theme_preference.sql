-- Migration 017: Add theme_preference column to users table
-- Idempotent via stored procedure (DROP PROCEDURE IF EXISTS pattern)
-- Run this on any environment; safe to re-run

DROP PROCEDURE IF EXISTS migration_017_users_theme_preference;

DELIMITER $$
CREATE PROCEDURE migration_017_users_theme_preference()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'theme_preference'
  ) THEN
    ALTER TABLE users
      ADD COLUMN theme_preference ENUM('dark', 'light') NOT NULL DEFAULT 'dark'
      AFTER app_access;
  END IF;
END $$
DELIMITER ;

CALL migration_017_users_theme_preference();
DROP PROCEDURE IF EXISTS migration_017_users_theme_preference;
