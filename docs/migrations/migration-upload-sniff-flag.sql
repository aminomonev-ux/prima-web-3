-- Migration: flag sniff_ok di uploaded_files (residual SDL-L3)
-- File yang magic-number-nya gagal di-sniff saat upload ditandai sniff_ok=0;
-- /api/upload/download serve file tersebut sebagai attachment (bukan inline)
-- supaya browser tidak pernah me-render konten yang tak terverifikasi.
-- Baris lama (pra-migration) default 1 = perilaku inline existing dipertahankan.

ALTER TABLE uploaded_files
  ADD COLUMN sniff_ok TINYINT(1) NOT NULL DEFAULT 1 AFTER context;
