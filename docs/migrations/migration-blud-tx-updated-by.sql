-- migration-blud-tx-updated-by.sql — temuan audit R5
--
-- `updateTx` memakai `created_by = COALESCE(created_by, ?)`: pembuat asli
-- dipertahankan (benar), tapi PENGUBAH tidak tercatat di barisnya sama sekali.
-- Jejaknya cuma ada di `audit_log` — tabel berretensi yang bisa dipangkas,
-- sementara baris transaksinya sendiri hidup terus. Setahun kemudian pertanyaan
-- "siapa yang mengubah kuitansi ini" tidak lagi bisa dijawab dari datanya.
--
-- NULL untuk baris lama disengaja: kita memang tidak tahu siapa, dan menebaknya
-- dengan `created_by` akan membuat data karangan yang terlihat seperti fakta.

ALTER TABLE blud_realisasi_tx
  ADD COLUMN updated_by INT NULL
    COMMENT 'R5 pengubah terakhir. NULL = belum pernah diubah sejak kolom ini ada'
    AFTER created_by;

ALTER TABLE blud_realisasi_tx
  ADD CONSTRAINT fk_brt_updater FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL;
