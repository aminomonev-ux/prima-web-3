-- Migration: tambah kolom snapshot nominal verifikasi Kasubag.
-- Konteks: nominal_disetujui ditimpa tiap tahap (Kasubag → lalu Kabag), sehingga
-- nilai yang diverifikasi Kasubag hilang setelah Kabag memutus. Kolom ini menyimpan
-- snapshot Kasubag sendiri untuk Total Verif Kasubag di Detail Usulan + rekap + export.
-- Baris lama: NULL (data Kasubag historis sudah tertimpa, tak bisa di-backfill).
-- MySQL 8.4 — tanpa IF NOT EXISTS pada ADD COLUMN.

ALTER TABLE usulan_items ADD COLUMN kasubag_nominal DECIMAL(18,2) DEFAULT NULL;
