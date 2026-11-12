-- migration-pk-asal.sql
-- Kolom `asal` di Master Program (`pk_program`) dan Master Sasaran (`pk_sasaran`) PK.
-- Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap D).
--
-- KENAPA: kedua master PK diisi dari Rencana Aksi lewat tombol Import Renaksi, tetapi tidak
-- mencatat baris mana yang berasal dari sana. Tanpa itu layar tidak bisa memberi tahu
-- "Rencana Aksi berubah" untuk baris yang memang wajib mengikutinya.
--
-- Isi awal (langkah 2) MENEBAK, sama seperti E-Anggaran (migration-kinerja-master-asal.sql):
--  - pk_program: jalurnya (sesudah bintang penanda dibuang) ada di Renaksi tahun yang sama.
--  - pk_sasaran: tingkat terdalamnya — nama sasaran (outcome atau nama entitas) + indikator,
--    sesudah bintang & awalan "(1)" dibuang — ada di Renaksi tahun yang sama.
-- Salah tebak hanya menambah/mengurangi lencana. Aturan murni yang sama:
-- lib/kinerja/asal-renaksi.ts `jalurAdaDiRenaksi` dan lib/pk/selaras-renaksi.ts
-- `sasaranAdaDiRenaksi`; diuji berdampingan (scripts/test-pk-selaras-renaksi.mts).
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: Master Program & Sasaran
-- membaca dan menulis kolom ini.

-- 1. Kolom
ALTER TABLE pk_program
  ADD COLUMN asal ENUM('MANUAL','RENAKSI') NOT NULL DEFAULT 'MANUAL'
    COMMENT 'RENAKSI = diambil lewat Import Renaksi' AFTER level;
ALTER TABLE pk_sasaran
  ADD COLUMN asal ENUM('MANUAL','RENAKSI') NOT NULL DEFAULT 'MANUAL'
    COMMENT 'RENAKSI = diambil lewat Import Renaksi' AFTER satuan_subkegiatan;

-- 2. Isi awal
/*UJI-AWAL*/
UPDATE pk_program m SET m.asal = 'RENAKSI'
WHERE m.level = 'program' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(m.tahun AS UNSIGNED) AND ra.level = 'program'
    AND TRIM(REGEXP_REPLACE(ra.program, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.program, '[[:space:]*]+$', ''))
);

UPDATE pk_program m SET m.asal = 'RENAKSI'
WHERE m.level = 'kegiatan' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(m.tahun AS UNSIGNED) AND ra.level = 'kegiatan'
    AND TRIM(REGEXP_REPLACE(ra.kegiatan, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.kegiatan, '[[:space:]*]+$', ''))
    AND TRIM(REGEXP_REPLACE(ra.program, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.program, '[[:space:]*]+$', ''))
);

UPDATE pk_program m SET m.asal = 'RENAKSI'
WHERE m.level = 'subkegiatan' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(m.tahun AS UNSIGNED) AND ra.level = 'sub-kegiatan'
    AND TRIM(REGEXP_REPLACE(ra.sub_kegiatan, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.subkegiatan, '[[:space:]*]+$', ''))
    AND TRIM(REGEXP_REPLACE(ra.program, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.program, '[[:space:]*]+$', ''))
    AND TRIM(REGEXP_REPLACE(ra.kegiatan, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.kegiatan, '[[:space:]*]+$', ''))
);

UPDATE pk_sasaran s SET s.asal = 'RENAKSI'
WHERE COALESCE(s.subkegiatan, '') <> '' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(s.tahun AS UNSIGNED) AND ra.level = 'sub-kegiatan'
    AND TRIM(REGEXP_REPLACE(COALESCE(ra.outcome_sub_kegiatan, ra.sub_kegiatan), '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(s.subkegiatan, '[[:space:]*]+$', ''))
    AND TRIM(REGEXP_REPLACE(REGEXP_REPLACE(ra.indikator, '[[:space:]*]+$', ''), '^([[:space:]]*[(][0-9]{1,2}[)][[:space:]]+)+', ''))
      = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(s.indikator_subkegiatan, ''), '[[:space:]*]+$', ''), '^([[:space:]]*[(][0-9]{1,2}[)][[:space:]]+)+', ''))
);

UPDATE pk_sasaran s SET s.asal = 'RENAKSI'
WHERE COALESCE(s.subkegiatan, '') = '' AND COALESCE(s.kegiatan, '') <> '' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(s.tahun AS UNSIGNED) AND ra.level = 'kegiatan'
    AND TRIM(REGEXP_REPLACE(COALESCE(ra.outcome_kegiatan, ra.kegiatan), '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(s.kegiatan, '[[:space:]*]+$', ''))
    AND TRIM(REGEXP_REPLACE(REGEXP_REPLACE(ra.indikator, '[[:space:]*]+$', ''), '^([[:space:]]*[(][0-9]{1,2}[)][[:space:]]+)+', ''))
      = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(s.indikator_kegiatan, ''), '[[:space:]*]+$', ''), '^([[:space:]]*[(][0-9]{1,2}[)][[:space:]]+)+', ''))
);

UPDATE pk_sasaran s SET s.asal = 'RENAKSI'
WHERE COALESCE(s.subkegiatan, '') = '' AND COALESCE(s.kegiatan, '') = '' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(s.tahun AS UNSIGNED) AND ra.level = 'program'
    AND TRIM(REGEXP_REPLACE(COALESCE(ra.outcome_program, ra.program), '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(s.program, '[[:space:]*]+$', ''))
    AND TRIM(REGEXP_REPLACE(REGEXP_REPLACE(ra.indikator, '[[:space:]*]+$', ''), '^([[:space:]]*[(][0-9]{1,2}[)][[:space:]]+)+', ''))
      = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(s.indikator_program, ''), '[[:space:]*]+$', ''), '^([[:space:]]*[(][0-9]{1,2}[)][[:space:]]+)+', ''))
);
/*UJI-AKHIR*/
