-- Migration: tambah kolom _asal untuk tracking revisi langsung bidang
-- Jalankan di HeidiSQL → SQL Editor

ALTER TABLE usulan_items
  ADD COLUMN nama_asal        VARCHAR(300)   DEFAULT NULL,
  ADD COLUMN spesifikasi_asal TEXT           DEFAULT NULL,
  ADD COLUMN qty_asal         INT            DEFAULT NULL,
  ADD COLUMN harga_asal       DECIMAL(18,2)  DEFAULT NULL;
