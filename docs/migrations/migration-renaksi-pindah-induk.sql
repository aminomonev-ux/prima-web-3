-- migration-renaksi-pindah-induk.sql
-- Catatan `renaksi_ganti_nama` ikut mencatat PINDAH INDUK kegiatan / sub kegiatan.
-- Konsep: docs/CONCEPT-renaksi-terhubung.md Tahap H.
--
-- KENAPA: memindah kegiatan ke program lain (atau sub kegiatan ke kegiatan lain) di Data Entry
-- Renaksi dulu terbaca di E-Anggaran & PK sebagai "satu tidak ada lagi + satu baru" — Rekening,
-- RKO, dan Realisasi yang menempel di entri lama harus dipindahkan manual. Dengan induk barunya
-- tercatat, modul penyalin bisa menawarkan "pindah induk" yang dijalankan Edit Master (menjalar).
--
-- NULL = induknya tidak berubah (catatan ganti nama biasa) — catatan lama tetap terbaca benar.
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang (sesudah migration-renaksi-ganti-nama.sql):
-- tanpa kolom ini setiap ganti nama / pindah induk di Data Entry Renaksi gagal (transaksinya dibatalkan).

ALTER TABLE renaksi_ganti_nama
  ADD COLUMN induk_baru VARCHAR(255) NULL COMMENT 'Induk langsung BARU bila pindah induk (kegiatan: program; sub: kegiatan)' AFTER induk_program,
  ADD COLUMN induk_program_baru VARCHAR(255) NULL COMMENT 'Program BARU bila sub kegiatan pindah program' AFTER induk_baru;
