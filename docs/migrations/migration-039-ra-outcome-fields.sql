-- Migration 039: tambah 3 kolom outcome di rencana_aksi.
-- "outcome_*" = pernyataan sasaran/outcome yang ingin dicapai per level,
-- BEDA dari kolom `sasaran` (migration 035) yg sekedar nomenklatur parent.
-- Dipakai sbg sumber data Master Sasaran PK via "Import Renaksi".
--
-- Mapping:
--   level=program       → outcome_program       (mis. "Meningkatnya kualitas pelayanan administrasi")
--   level=kegiatan      → outcome_kegiatan      (mis. "Tersedianya layanan administrasi yg tepat waktu")
--   level=sub-kegiatan  → outcome_sub_kegiatan  (mis. "Terlaksananya pengelolaan ATK")
--
-- Nullable: row existing semua punya NULL sampai user re-edit (backward compatible).

ALTER TABLE rencana_aksi
  ADD COLUMN outcome_program      VARCHAR(500) NULL AFTER sasaran,
  ADD COLUMN outcome_kegiatan     VARCHAR(500) NULL AFTER outcome_program,
  ADD COLUMN outcome_sub_kegiatan VARCHAR(500) NULL AFTER outcome_kegiatan;
