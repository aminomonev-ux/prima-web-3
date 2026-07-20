-- Migration: IKI — 1 orang boleh punya dokumen per jabatan di tahun sama (kasus Plt.)
-- Keputusan user 2026-07-20 (opsi A): pejabat Plt. memegang 2 jabatan → 2 dokumen IKI
-- terpisah walau NIP + tahun sama. UNIQUE lama (nip, tahun) diganti (nip, tahun, jabatan).
-- Jalankan di database MySQL 8.4 PRIMA.

ALTER TABLE iki_dokumen
  DROP INDEX uk_iki_nip_tahun,
  ADD UNIQUE KEY uk_iki_nip_tahun_jabatan (nip, tahun, jabatan);
