-- migration-bba-simplify-status.sql
-- BBA: hapus status DILUNCURKAN & DIBATALKAN + infra luncuran (parent_row_id / carry-over chain).
-- nilai_rencana sekarang OTOMATIS = vol * harga (dihitung server-side; kolom tetap disimpan).
-- MySQL 8.4. Jalankan sekali.

-- 1) Normalisasi data lama ke status valid sebelum mengecilkan ENUM (cegah '' invalid).
UPDATE buku_besar_aset SET status = 'TIDAK_TEREALISASI' WHERE status IN ('DILUNCURKAN', 'DIBATALKAN');

-- 2) Kecilkan ENUM status → 4 nilai.
ALTER TABLE buku_besar_aset
  MODIFY COLUMN status ENUM('DIRENCANAKAN', 'REALISASI_PENUH', 'REALISASI_SEBAGIAN', 'TIDAK_TEREALISASI')
  NOT NULL DEFAULT 'DIRENCANAKAN';

-- 3) Hapus infrastruktur luncuran (tak terpakai — tak ada aksi Luncurkan).
--    FK wajib di-drop dulu; DROP COLUMN otomatis menghapus index idx_im_parent.
ALTER TABLE buku_besar_aset DROP FOREIGN KEY fk_im_parent;
ALTER TABLE buku_besar_aset DROP COLUMN parent_row_id;

-- 4) Sinkronkan nilai_rencana baris lama = vol * harga (konsistensi dgn aturan baru).
UPDATE buku_besar_aset SET nilai_rencana = vol * harga;
