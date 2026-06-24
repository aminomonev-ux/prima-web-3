-- Migration 037: Role Promotion Ladder.
-- Konsep lengkap: docs/session/ROLE_PROMOTION_CONCEPT.md (lock-in 2026-05-30).
--
-- Scope:
--   1. CREATE TABLE system_settings (kv generic, dipakai juga utk bootstrap flag).
--   2. CREATE TABLE role_promotion_requests (req lifecycle).
--   3. ALTER TABLE users — 5 kolom baru utk probation + lock tracking.
--
-- Catatan deploy:
--   - Pakai mysql cli atau migration runner: `mysql -u prima_user prima_db < migration-037-role-promotion.sql`
--   - Idempotent untuk CREATE (IF NOT EXISTS). ALTER tidak idempotent — kalau retry,
--     hapus baris ALTER yang sudah jalan atau pakai SHOW COLUMNS dulu.
--   - Tidak ada backfill data (kolom semua nullable / DEFAULT).

-- ─── 1. system_settings (generic key-value) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  `key`      VARCHAR(100)  NOT NULL PRIMARY KEY,
  `val`      TEXT          NULL,
  updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Generic system settings (kv); dipakai utk bootstrap flag dst';

-- Bootstrap flag: NULL=belum pernah, datetime=sudah pernah dipakai (single-use).
-- Clear manual oleh DB admin = incident response (audit log keras).
INSERT IGNORE INTO system_settings (`key`, `val`)
VALUES ('bootstrap_super_admin_used_at', NULL);

-- Recovery flag: NULL=belum pernah, datetime=sudah pernah dipakai (single-use).
-- Dipakai scripts/promotion-recovery.js — break-glass all-SA-locked emergency.
INSERT IGNORE INTO system_settings (`key`, `val`)
VALUES ('recovery_used_at', NULL);

-- ─── 2. role_promotion_requests ──────────────────────────────────────────────
-- FK user_id + approved_by → users.id (signed INT, match `rekap_pk.saved_by` pattern).
-- MySQL 3780 mismatch kalau pakai INT UNSIGNED — users.id signed.
CREATE TABLE IF NOT EXISTS role_promotion_requests (
  id              INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id         INT            NOT NULL,
  from_role       VARCHAR(50)    NOT NULL,
  to_role         VARCHAR(50)    NOT NULL,
  reason          VARCHAR(1000)  NOT NULL DEFAULT '',
  status          ENUM('PENDING','COOLDOWN','COMPLETED','REJECTED','EXPIRED','CANCELLED')
                                 NOT NULL DEFAULT 'PENDING',
  approved_by     INT            NULL,
  approved_at     DATETIME       NULL,
  cooldown_until  DATETIME       NULL,
  completed_at    DATETIME       NULL,
  rejected_reason VARCHAR(500)   NULL,
  is_bootstrap    TINYINT(1)     NOT NULL DEFAULT 0,
  ip_address      VARCHAR(45)    NULL,
  user_agent      VARCHAR(250)   NULL,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prr_user_status     (user_id, status),
  INDEX idx_prr_status_cooldown (status, cooldown_until),
  INDEX idx_prr_status_created  (status, created_at),
  CONSTRAINT fk_prr_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_prr_approver
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Role promotion requests — multi-layer security ladder';

-- ─── 3. users — kolom baru untuk promotion ───────────────────────────────────
-- L4 rate limit: lock window + counter.
ALTER TABLE users ADD COLUMN promotion_locked_until DATETIME       NULL;
ALTER TABLE users ADD COLUMN promotion_failed_count INT            NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN promotion_failed_at    DATETIME       NULL;

-- Probationary period (7 hari sejak role aktif).
ALTER TABLE users ADD COLUMN probationary_until      DATETIME      NULL;
ALTER TABLE users ADD COLUMN probationary_from_role  VARCHAR(50)   NULL;

CREATE INDEX idx_users_promotion_lock  ON users (promotion_locked_until);
CREATE INDEX idx_users_probation_until ON users (probationary_until);
