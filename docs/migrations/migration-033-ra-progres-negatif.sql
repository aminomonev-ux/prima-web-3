-- Migration 033: tambah enum 'Progres Negatif' ke rencana_aksi.jenis
-- Indikator dengan semantik "lower-is-better" (e.g. angka kematian, komplain, error rate).
-- Formula: realisasi akhir = MIN(quarters aktif), % capaian = (target/realisasi)*100 (inverted).
-- Additive ENUM ALTER — MySQL 8 INSTANT, no lock.

ALTER TABLE rencana_aksi
  MODIFY COLUMN jenis ENUM('Akumulatif','Progres Positif','Progres Negatif','Pengulangan')
  NOT NULL DEFAULT 'Akumulatif';
