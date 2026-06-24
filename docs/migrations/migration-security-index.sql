-- Migration: functional index LOWER(username) untuk query login
-- Jalankan di MySQL console / phpMyAdmin / Workbench

-- Drop index lama jika ada (opsional, bisa coexist)
-- ALTER TABLE users DROP INDEX idx_users_username;

-- Tambah functional index untuk LOWER(username)
-- MySQL 8.0.13+ support functional indexes
ALTER TABLE users
  ADD INDEX idx_users_username_lower ((LOWER(username)));
