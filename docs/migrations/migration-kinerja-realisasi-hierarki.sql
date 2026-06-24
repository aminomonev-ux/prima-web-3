-- Migration: Tambah kolom hierarki ke kinerja_realisasi
-- Dan hapus menu Nomenklatur (tabel dibiarkan, tidak di-drop untuk safety)

-- 1. Tambah kolom hierarki ke kinerja_realisasi
ALTER TABLE kinerja_realisasi
  ADD COLUMN program     VARCHAR(255) DEFAULT NULL COMMENT 'Diisi otomatis dari Init SSK' AFTER keterangan,
  ADD COLUMN kegiatan    VARCHAR(255) DEFAULT NULL AFTER program,
  ADD COLUMN subkegiatan VARCHAR(255) DEFAULT NULL AFTER kegiatan,
  ADD COLUMN uraian_ssk  VARCHAR(255) DEFAULT NULL AFTER subkegiatan;

-- 2. (Opsional) Drop tabel nomenklatur jika sudah tidak diperlukan sama sekali
-- UNCOMMENT baris di bawah jika yakin tidak ada data penting:
-- DROP TABLE IF EXISTS kinerja_realisasi_nomen;
