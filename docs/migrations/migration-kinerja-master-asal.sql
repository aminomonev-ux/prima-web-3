-- migration-kinerja-master-asal.sql
-- Kolom `kinerja_master.asal`: entri Master E-Anggaran yang diambil dari Rencana Aksi.
-- Konsep: docs/CONCEPT-renaksi-terhubung.md §5.1 (Tahap B).
--
-- KENAPA: Master tidak mencatat asal, jadi layar tidak bisa membedakan entri hasil
-- Init Renaksi dari entri ketikan tangan, dan pemberitahuan "Rencana Aksi berubah"
-- (Tahap C) tidak tahu entri mana yang wajib mengikuti Renaksi.
--
-- Hanya bermakna untuk tipe program, kegiatan, subkegiatan. Init Renaksi menulis
-- RENAKSI; entri yang dibuat cara lain (form, impor, Lengkapi Master) tetap MANUAL.
--
-- Isi awal (langkah 2) MENEBAK: entri yang jalurnya — sesudah bintang penanda di ujung
-- nama dibuang — ada di Renaksi tahun yang sama ditandai RENAKSI. Kolom induk yang kosong
-- (data lama) dianggap cocok, aturan yang sama dengan pilihan berantai (`cocokInduk`).
-- Salah tebak hanya menambah/mengurangi lencana, tidak mengubah angka apa pun. Aturan
-- yang sama ditulis murni di lib/kinerja/asal-renaksi.ts (`jalurAdaDiRenaksi`) dan diuji
-- berdampingan dengan langkah ini (scripts/test-kinerja-asal-renaksi.mts) — mengubah
-- salah satunya wajib mengubah keduanya.
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: tab Master membaca kolom ini.

-- 1. Kolom
ALTER TABLE kinerja_master
  ADD COLUMN asal ENUM('MANUAL','RENAKSI') NOT NULL DEFAULT 'MANUAL'
    COMMENT 'RENAKSI = diambil lewat Init Renaksi (program/kegiatan/subkegiatan)' AFTER subkegiatan_ref;

-- 2. Isi awal
/*UJI-AWAL*/
UPDATE kinerja_master m SET m.asal = 'RENAKSI'
WHERE m.tipe = 'program' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(m.tahun AS UNSIGNED) AND ra.level = 'program'
    AND TRIM(REGEXP_REPLACE(ra.program, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.nama, '[[:space:]*]+$', ''))
);

UPDATE kinerja_master m SET m.asal = 'RENAKSI'
WHERE m.tipe = 'kegiatan' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(m.tahun AS UNSIGNED) AND ra.level = 'kegiatan'
    AND TRIM(REGEXP_REPLACE(ra.kegiatan, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.nama, '[[:space:]*]+$', ''))
    AND (COALESCE(m.program_ref, '') = ''
      OR TRIM(REGEXP_REPLACE(ra.program, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.program_ref, '[[:space:]*]+$', '')))
);

UPDATE kinerja_master m SET m.asal = 'RENAKSI'
WHERE m.tipe = 'subkegiatan' AND EXISTS (
  SELECT 1 FROM rencana_aksi ra
  WHERE ra.tahun = CAST(m.tahun AS UNSIGNED) AND ra.level = 'sub-kegiatan'
    AND TRIM(REGEXP_REPLACE(ra.sub_kegiatan, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.nama, '[[:space:]*]+$', ''))
    AND (COALESCE(m.program_ref, '') = ''
      OR TRIM(REGEXP_REPLACE(ra.program, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.program_ref, '[[:space:]*]+$', '')))
    AND (COALESCE(m.kegiatan_ref, '') = ''
      OR TRIM(REGEXP_REPLACE(ra.kegiatan, '[[:space:]*]+$', '')) = TRIM(REGEXP_REPLACE(m.kegiatan_ref, '[[:space:]*]+$', '')))
);
/*UJI-AKHIR*/
