-- Migration 043: R6 — target/realisasi rencana_aksi menerima desimal
-- (indikator rasio mis. 99,5 tidak bisa presisi di kolom INT).
-- Catatan: data existing INT tersalin apa adanya (aman, tanpa kehilangan nilai).

ALTER TABLE rencana_aksi
  MODIFY target_rpjmd   DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY target_tahunan DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q1_target      DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q1_realisasi   DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q2_target      DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q2_realisasi   DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q3_target      DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q3_realisasi   DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q4_target      DECIMAL(14,2) NOT NULL DEFAULT 0,
  MODIFY q4_realisasi   DECIMAL(14,2) NOT NULL DEFAULT 0;
