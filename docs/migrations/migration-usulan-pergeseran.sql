-- Migration: Usulan Kebutuhan — tambah jenis usulan PERGESERAN
-- Penomoran per-jenis (MURNI=UA- / PERUBAHAN=UAPB- / PERGESERAN=UAPR-) ditangani
-- di app layer (lib/data/usulan.ts generateNoUsulan) — tidak butuh kolom DB.
-- MySQL 8.4 syntax. MODIFY COLUMN (bukan ADD COLUMN) → aman tanpa IF NOT EXISTS.

ALTER TABLE usulan_headers
  MODIFY COLUMN jenis_usulan ENUM('MURNI','PERUBAHAN','PERGESERAN') NOT NULL DEFAULT 'MURNI';
