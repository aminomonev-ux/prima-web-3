-- migration-renaksi-kode.sql
-- Kolom `kode` (nomenklatur, mis. 1.02.02.2.01) pada rencana_aksi.
--
-- KENAPA: hierarki Renaksi disambung TEKS NAMA (kolom program/kegiatan/sub_kegiatan),
-- bukan id. Akibatnya identitas sebuah program bergantung pada ejaan namanya — ganti
-- satu huruf, anak-anaknya jadi yatim tanpa MySQL bisa menolak. Kode nomenklatur
-- adalah jangkar identitas yang tidak ikut berubah saat nama diperbaiki.
--
-- Parser impor SUDAH membaca kode ini dari file (dipakai menebak level: 3 segmen =
-- program, 5 = kegiatan, 6 = sub-kegiatan) tapi selama ini dibuang saat commit.
-- Migrasi ini + perubahan di lib/renaksi/import-data.ts membuatnya ikut tersimpan.
--
-- NULL diperbolehkan: baris lama belum punya kode, dan level tujuan/sasaran memang
-- tidak bernomenklatur. TIDAK unik: satu program dengan 5 indikator = 5 baris yang
-- semuanya membawa kode sama — persis seperti kolom `program`.
--
-- Panjang 60 mengikuti LEN.kode di lib/renaksi/import-renaksi.ts.

ALTER TABLE rencana_aksi
  ADD COLUMN kode VARCHAR(60) NULL DEFAULT NULL
    COMMENT 'Kode nomenklatur (1.02.02.2.01) — jangkar identitas lintas ganti nama'
    AFTER level;

-- Cermin idx_tahun_level_prog yang sudah ada untuk pencarian berbasis nama.
ALTER TABLE rencana_aksi
  ADD INDEX idx_tahun_level_kode (tahun, level, kode);
