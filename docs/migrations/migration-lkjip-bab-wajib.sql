-- migration-lkjip-bab-wajib.sql — 2026-09-30 (audit sistem, B12)
--
-- Kolom `lkjip_section.locked` dirancang untuk 4 BAB wajib ("1 = node bawaan seed, tak
-- bisa hapus/pindah"), tapi seed selalu menulis 0 sejak edisi intranet pertama — jadi
-- tidak ada satu dokumen pun yang BAB-nya terkunci, walau panduan editor menjanjikannya.
-- Kode baru menulis 1 untuk dokumen baru; berkas ini mengisi dokumen yang sudah ada.
--
-- Dikenali lewat judul PERSIS (tanpa beda huruf besar/kecil & spasi tepi) di tingkat bab:
-- PENDAHULUAN · PERENCANAAN KINERJA · AKUNTABILITAS KINERJA · PENUTUP — sama dengan
-- `JUDUL_BAB_WAJIB` di lib/lkjip/aturan-bab.ts. Bab yang judulnya sudah diganti TIDAK
-- ditebak; dokumennya muncul di laporan di bawah untuk diperiksa manual.
--
-- Aman dijalankan ulang (hanya mengubah baris yang masih 0). Tidak ada perubahan skema.

UPDATE lkjip_section
   SET locked = 1
 WHERE parent_id IS NULL
   AND locked = 0
   AND UPPER(TRIM(judul)) IN ('PENDAHULUAN', 'PERENCANAAN KINERJA', 'AKUNTABILITAS KINERJA', 'PENUTUP');

-- Laporan: dokumen yang BAB wajibnya tidak dikenali lengkap (judul diganti/dihapus, atau
-- memang dibuat dari template kosong). Kunci manual kalau perlu:
--   UPDATE lkjip_section SET locked = 1 WHERE id = <id bab>;
SELECT d.id, d.canonical_id, d.tahun, d.judul, COUNT(s.id) AS bab_wajib_dikenali
  FROM lkjip_dokumen d
  LEFT JOIN lkjip_section s ON s.dokumen_id = d.id AND s.parent_id IS NULL AND s.locked = 1
 GROUP BY d.id, d.canonical_id, d.tahun, d.judul
HAVING COUNT(s.id) <> 4;
