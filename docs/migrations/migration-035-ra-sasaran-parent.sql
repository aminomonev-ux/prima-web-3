-- Migration 035: tambah kolom 'sasaran' di rencana_aksi sbg parent reference utk level=program.
-- Form Data Entry Program: user input Sasaran + Program + Indikator.
-- Dashboard Kinerja Program: cascade dropdown Sasaran -> Program -> Indikator.
-- Nullable: row existing level=program akan punya sasaran=NULL sampai user re-edit.
-- Untuk level=sasaran row, kolom ini tetap NULL (sasaran name di kolom 'program').

ALTER TABLE rencana_aksi
  ADD COLUMN sasaran VARCHAR(255) NULL AFTER level;
