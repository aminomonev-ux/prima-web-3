-- migration-drive-arsip-asal.sql — kolom penanda salinan lampiran di drive_arsip.
-- Konsep: docs/CONCEPT-drive-terpusat.md §20.
--
-- KENAPA berkas terpisah: kolom ini ditambahkan ke migration-drive-arsip.sql SESUDAH berkas itu
-- pertama kali terbit. Basis data yang sudah menjalankan bentuk lamanya tidak mendapat kolomnya
-- (CREATE TABLE IF NOT EXISTS melewati tabel yang sudah ada). Tanpa kolom ini skrip backup
-- melewati salinan lampiran ke Drive ("manifest drive_arsip belum siap").
--
-- Jalankan SESUDAH migration-drive-arsip.sql. Kalau MySQL menjawab 1060 "Duplicate column name"
-- atau 1061 "Duplicate key name", kolom/indeksnya sudah ada (tabel dibuat dari bentuk baru) —
-- aman diabaikan.

ALTER TABLE drive_arsip
  ADD COLUMN asal_file_id VARCHAR(64) NULL AFTER sumber;

ALTER TABLE drive_arsip
  ADD KEY idx_drive_arsip_asal (asal_file_id);
