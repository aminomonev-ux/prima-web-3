-- Migration 042: tambah level 'tujuan' (induk Sasaran) di rencana_aksi.
-- Hirarki baru: Tujuan -> Sasaran -> Program -> Kegiatan -> Sub Kegiatan.
-- Pola mirror level=sasaran:
--   * Nama Tujuan disimpan di kolom 'program' (sama spt sasaran simpan namanya di 'program').
--   * Kolom 'tujuan' baru = parent reference utk level=sasaran (mirror kolom 'sasaran' utk level=program, migration 035).
-- Nullable: row existing level=sasaran akan punya tujuan=NULL sampai user re-edit.
-- Untuk level=tujuan row, kolom 'tujuan' tetap NULL (nama tujuan di kolom 'program').

ALTER TABLE rencana_aksi
  MODIFY COLUMN level ENUM('tujuan','sasaran','program','kegiatan','sub-kegiatan') NOT NULL;

ALTER TABLE rencana_aksi
  ADD COLUMN tujuan VARCHAR(255) NULL AFTER sasaran;
