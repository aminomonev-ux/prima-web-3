-- Fix warning TINYINT(1) deprecated pada tabel BLUD
ALTER TABLE dpa_blud MODIFY COLUMN is_latest TINYINT NOT NULL DEFAULT 1;
ALTER TABLE pergeseran_dpa MODIFY COLUMN is_latest TINYINT NOT NULL DEFAULT 1;
