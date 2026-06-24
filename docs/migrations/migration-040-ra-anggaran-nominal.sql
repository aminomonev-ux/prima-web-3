-- Migration 040: Anggaran Nominal (info pagu) di rencana_aksi
-- Kolom info pagu anggaran (Rp) — hanya diisi untuk baris level='sub-kegiatan',
-- NULL untuk level lain. Single nominal total per sub-kegiatan (pagu/rencana saja).
ALTER TABLE rencana_aksi
  ADD COLUMN anggaran_nominal BIGINT NULL DEFAULT NULL
  COMMENT 'Pagu anggaran (Rp) — hanya untuk level sub-kegiatan';
