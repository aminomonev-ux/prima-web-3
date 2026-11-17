-- ═══ LKJIP — arsip PDF di riwayat versi ═══════════════════════════════════════
-- Konsep: docs/konsep/lkjip/CONCEPT-lkjip-kertas-margin-arsip-pdf.md bagian B.
-- Simpan Versi (dan Finalisasi) kini mengarsipkan PDF di samping Word. NULL = versi tanpa arsip PDF
-- (versi lama, Drive belum diatur, atau LibreOffice tidak tersedia saat itu).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: daftar Riwayat Versi membaca kolom ini.

ALTER TABLE lkjip_versi
  ADD COLUMN pdf_file_id VARCHAR(64)  NULL AFTER drive_name,
  ADD COLUMN pdf_name    VARCHAR(255) NULL AFTER pdf_file_id;
