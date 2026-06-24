-- Migration: uploaded_files — ownership tracking untuk file Drive (L61 fix)
-- Tujuan: /api/upload/download sebelumnya capability-URL (siapa pun login + tahu fileId
-- bisa unduh file apa pun). Tabel ini mencatat siapa peng-upload tiap file → download
-- bisa di-authorize per-file (uploader atau role elevated), bukan sekadar "sudah login".
-- File lama (tanpa baris di sini) = legacy → fallback akses login (back-compat), tetap di-audit.

CREATE TABLE IF NOT EXISTS uploaded_files (
  file_id      VARCHAR(64)  NOT NULL,
  uploaded_by  INT          NULL,
  context      VARCHAR(40)  NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (file_id),
  CONSTRAINT fk_uploaded_files_user FOREIGN KEY (uploaded_by)
    REFERENCES users(id) ON DELETE SET NULL
) COMMENT='Ownership file Drive untuk authorize /api/upload/download (L61)';

CREATE INDEX idx_uploaded_files_user ON uploaded_files (uploaded_by);
