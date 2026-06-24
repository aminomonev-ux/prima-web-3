-- Migration 038 — Email Log + Promotion notif toggles
-- Replaces: app_config keys `email_sent_<date>` + `email_sent_month_<month>` (counter sederhana, lihat L+1).
-- Backward compat: row counter lama tidak dihapus (deprecated saja), getEmailQuota() refactor ke email_log.

-- ─── 1. Table email_log ─────────────────────────────────────────────────────
-- Audit trail per kirim email — siapa, kapan, event apa, status.
-- Replaces tracking di app_config (bisa filter per event_type, lihat error_msg, hitung accurate).

CREATE TABLE IF NOT EXISTS email_log (
  id          BIGINT       AUTO_INCREMENT PRIMARY KEY,
  sent_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recipient   VARCHAR(255) NOT NULL,
  subject     VARCHAR(500) NOT NULL,
  event_type  VARCHAR(64)  NOT NULL,
  status      ENUM('SENT','FAILED','SKIPPED_TOGGLE','SKIPPED_NO_CREDS') NOT NULL,
  error_msg   TEXT         NULL,
  INDEX idx_email_log_sent_at    (sent_at),
  INDEX idx_email_log_event_type (event_type),
  INDEX idx_email_log_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. Toggle keys baru untuk Promotion events ─────────────────────────────
-- Existing keys (sudah ada dari versi sebelumnya — tidak diubah):
--   email_notif_enabled, email_notif_usulan_baru, email_notif_disetujui,
--   email_notif_ditolak, email_notif_revisi, email_notif_recipient

INSERT IGNORE INTO app_config (`key`, value) VALUES
  ('email_notif_promotion_new_request', 'true'),
  ('email_notif_promotion_approved',    'true'),
  ('email_notif_promotion_rejected',    'true'),
  ('email_notif_promotion_bootstrap',   'true');

-- ─── 3. Cleanup catatan (manual, non-required) ──────────────────────────────
-- Setelah deploy, row counter lama `email_sent_*` + `email_sent_month_*` bisa
-- dibersihkan (storage hemat, tidak essential):
--   DELETE FROM app_config WHERE `key` LIKE 'email_sent_%';
-- Tidak di-execute otomatis supaya rollback aman.
