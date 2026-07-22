-- Migration: IKI — Jenis Dokumen MURNI / PERUBAHAN
-- Keputusan user 2026-07-22: Perubahan boleh berdampingan dengan Murni untuk
-- orang+jabatan+tahun yang sama (IKI Perubahan = dokumen tersendiri di tengah
-- tahun). UNIQUE lama (nip, tahun, jabatan) diganti (nip, tahun, jabatan, jenis).
-- Efek jenis: HANYA judul dokumen ("... INDIVIDU" vs "... INDIVIDU PERUBAHAN").
-- Jalankan di database MySQL 8.4 PRIMA.

ALTER TABLE iki_dokumen
  ADD COLUMN jenis ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI' AFTER varian;

ALTER TABLE iki_dokumen
  DROP INDEX uk_iki_nip_tahun_jabatan,
  ADD UNIQUE KEY uk_iki_nip_tahun_jabatan_jenis (nip, tahun, jabatan, jenis);
