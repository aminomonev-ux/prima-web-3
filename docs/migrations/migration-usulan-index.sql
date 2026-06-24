-- Migration: tambah index created_by + tanggal di usulan_headers
-- Jalankan di HeidiSQL → SQL Editor

ALTER TABLE usulan_headers
  ADD INDEX idx_usulan_headers_created_by (created_by),
  ADD INDEX idx_usulan_headers_tanggal    (tanggal);
