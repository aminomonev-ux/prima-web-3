-- Migration: tambah kolom qty & harga revisi Kasubag.
-- Form Putusan Kasubag (mode Revisi) sudah menangkap qty + harga (nominal = qty x harga),
-- tapi sebelumnya hanya nominal yang disimpan; qty/harga dibuang. Kolom ini menyimpannya
-- agar chain revisi qty/harga di Detail Usulan bisa menampilkan revisi Kasubag
-- (mirip revisi Admin). Baris lama: NULL.
-- MySQL 8.4 — tanpa IF NOT EXISTS pada ADD COLUMN.

ALTER TABLE usulan_items ADD COLUMN kasubag_qty INT DEFAULT NULL;
ALTER TABLE usulan_items ADD COLUMN kasubag_harga DECIMAL(18,2) DEFAULT NULL;
