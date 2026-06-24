-- migration-rima-unanswered.sql — #2 fail-log mining Rima.
-- Tabel telemetri pertanyaan Rima yang gagal dijawab classifier (bahan tumbuh KB).
-- Teks sudah di-redaksi PII di klien + server (R4/G27) sebelum disimpan.
-- MySQL 8.4 — tanpa IF NOT EXISTS pada ADD COLUMN (ini CREATE TABLE, aman).

CREATE TABLE IF NOT EXISTS rima_unanswered (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question    VARCHAR(200)    NOT NULL,
  page        VARCHAR(120)    NULL,
  user_id     INT             NULL,
  role        VARCHAR(40)     NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rima_unans_created (created_at),
  CONSTRAINT fk_rima_unans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Pertanyaan Rima tak terjawab — bahan tumbuh KB (#2 fail-log mining)';
