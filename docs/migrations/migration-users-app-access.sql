-- Migration: tambah kolom app_access dan email_verified ke tabel users
-- Jalankan di HeidiSQL → SQL Editor

ALTER TABLE users
  ADD COLUMN email_verified      TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN email_verify_token  VARCHAR(255) DEFAULT NULL,
  ADD COLUMN email_verify_expiry DATETIME     DEFAULT NULL,
  ADD COLUMN reset_token         VARCHAR(255) DEFAULT NULL,
  ADD COLUMN reset_token_expiry  DATETIME     DEFAULT NULL,
  ADD COLUMN failed_attempts     INT          NOT NULL DEFAULT 0,
  ADD COLUMN locked_until        DATETIME     DEFAULT NULL,
  ADD COLUMN last_login          DATETIME     DEFAULT NULL,
  ADD COLUMN app_access          JSON         DEFAULT NULL;
