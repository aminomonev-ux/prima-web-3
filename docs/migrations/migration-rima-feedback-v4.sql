-- migration-rima-feedback-v4.sql — RAL-2/RAL-3 (CONCEPT-rima-v4-learning.md)
-- Active learning + labeling workbench: rima_unanswered diperluas jadi tabel
-- telemetri belajar Rima (klik kandidat A5, thumbs 👍/👎, label admin).
-- MySQL 8.4. Jalankan sekali. Tidak menyentuh data existing (default aman).

ALTER TABLE rima_unanswered
  ADD COLUMN kind ENUM('UNANSWERED','CANDIDATE_PICK','THUMBS_UP','THUMBS_DOWN')
    NOT NULL DEFAULT 'UNANSWERED' AFTER question,
  ADD COLUMN chosen_intent VARCHAR(64) NULL AFTER kind,
  ADD COLUMN label_intent VARCHAR(64) NULL AFTER chosen_intent,
  ADD COLUMN label_status ENUM('BARU','DILABELI','DIABAIKAN')
    NOT NULL DEFAULT 'BARU' AFTER label_intent,
  ADD COLUMN labeled_by INT NULL AFTER label_status,
  ADD COLUMN labeled_at DATETIME NULL AFTER labeled_by;

ALTER TABLE rima_unanswered
  ADD KEY idx_rima_unans_label (label_status, kind),
  ADD CONSTRAINT fk_rima_unans_labeler FOREIGN KEY (labeled_by)
    REFERENCES users(id) ON DELETE SET NULL;
