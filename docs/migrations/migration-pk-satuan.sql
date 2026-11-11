-- Perjanjian Kinerja — satuan jadi kolom sendiri (docs/CONCEPT-pk-halaman-2-sesuai-pdf.md §4).
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: Master Sasaran, form dokumen,
-- dan pembuat Word membaca kolom `satuan*`. Tanpa kolomnya, layar-layar itu gagal dimuat.
--
-- SEBAB. Format PK 2026 mencetak Satuan dan Target di dua kolom, sedangkan `target_*`
-- selama ini berisi keduanya sekaligus ("765 Orang", "10%").
--
-- Dijalankan SEKALI. Bila langkah 1 diulang MySQL menjawab ER_DUP_FIELDNAME (1060) dan itu
-- aman diabaikan. Langkah 3–4 aman diulang: hanya menyentuh baris yang satuannya masih kosong
-- dan targetnya masih berbentuk "angka + satuan".

-- 1. Kolom baru
ALTER TABLE pk_sasaran
  ADD COLUMN satuan_program     VARCHAR(50) NULL AFTER target_program,
  ADD COLUMN satuan_kegiatan    VARCHAR(50) NULL AFTER target_kegiatan,
  ADD COLUMN satuan_subkegiatan VARCHAR(50) NULL AFTER target_subkegiatan;

ALTER TABLE pk_dokumen_lampiran
  ADD COLUMN satuan VARCHAR(50) NULL AFTER target;

-- 2. Lebar disamakan dengan sumbernya. Master Sasaran sudah 500 (migration-pk-sasaran-lebar.sql),
--    lampiran dokumen masih 255: sasaran yang lebih panjang (data 2026 ada yang 300 huruf)
--    bisa dipilih di form lalu ditolak saat disimpan. Hanya melebarkan, tidak ada yang terpotong.
ALTER TABLE pk_dokumen_lampiran
  MODIFY program     VARCHAR(500),
  MODIFY kegiatan    VARCHAR(500),
  MODIFY subkegiatan VARCHAR(500),
  MODIFY uraian      VARCHAR(500) NOT NULL;

-- 3. Master Sasaran: "765 Orang" → target "765" + satuan "Orang"; "Persen" ditulis "%".
--    Dipisah SESUDAH angka di depan (bukan di spasi terakhir: "3 Laporan Bulanan").
--    Yang tidak diawali angka, tidak bersatuan, atau satuannya > 50 huruf TIDAK disentuh
--    dan muncul di laporan langkah 5. Aturannya cermin `pisahTargetSatuan`
--    (lib/shared/target-renaksi.ts) — mengubah satu wajib mengubah keduanya.
--    Urutan SET penting: satuan dibaca dari target LAMA, baru targetnya ditimpa
--    (UPDATE satu tabel dievaluasi kiri ke kanan).
UPDATE pk_sasaran SET
  satuan_program = CASE
    WHEN LOWER(TRIM(REGEXP_REPLACE(target_program, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) = 'persen' THEN '%'
    ELSE TRIM(REGEXP_REPLACE(target_program, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', '')) END,
  target_program = REGEXP_SUBSTR(target_program, '[0-9]+([.,][0-9]+)*'),
  updated_at = updated_at
WHERE satuan_program IS NULL
  AND target_program REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*[[:alpha:]%]'
  AND CHAR_LENGTH(TRIM(REGEXP_REPLACE(target_program, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) <= 50;

UPDATE pk_sasaran SET
  satuan_kegiatan = CASE
    WHEN LOWER(TRIM(REGEXP_REPLACE(target_kegiatan, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) = 'persen' THEN '%'
    ELSE TRIM(REGEXP_REPLACE(target_kegiatan, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', '')) END,
  target_kegiatan = REGEXP_SUBSTR(target_kegiatan, '[0-9]+([.,][0-9]+)*'),
  updated_at = updated_at
WHERE satuan_kegiatan IS NULL
  AND target_kegiatan REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*[[:alpha:]%]'
  AND CHAR_LENGTH(TRIM(REGEXP_REPLACE(target_kegiatan, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) <= 50;

UPDATE pk_sasaran SET
  satuan_subkegiatan = CASE
    WHEN LOWER(TRIM(REGEXP_REPLACE(target_subkegiatan, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) = 'persen' THEN '%'
    ELSE TRIM(REGEXP_REPLACE(target_subkegiatan, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', '')) END,
  target_subkegiatan = REGEXP_SUBSTR(target_subkegiatan, '[0-9]+([.,][0-9]+)*'),
  updated_at = updated_at
WHERE satuan_subkegiatan IS NULL
  AND target_subkegiatan REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*[[:alpha:]%]'
  AND CHAR_LENGTH(TRIM(REGEXP_REPLACE(target_subkegiatan, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) <= 50;

-- 4. Lampiran dokumen yang masih DRAFT. Dokumen FINAL sengaja TIDAK disentuh: berkas Word-nya
--    sudah tersimpan, dan isinya dibaca modul lain (tabel LKJIP tertaut) apa adanya.
--    Tetap satu tabel + subkueri: UPDATE banyak-tabel tidak menjamin urutan SET.
UPDATE pk_dokumen_lampiran SET
  satuan = CASE
    WHEN LOWER(TRIM(REGEXP_REPLACE(target, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) = 'persen' THEN '%'
    ELSE TRIM(REGEXP_REPLACE(target, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', '')) END,
  target = REGEXP_SUBSTR(target, '[0-9]+([.,][0-9]+)*')
WHERE satuan IS NULL
  AND dokumen_id IN (SELECT id FROM pk_dokumen WHERE status = 'DRAFT')
  AND target REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*[[:alpha:]%]'
  AND CHAR_LENGTH(TRIM(REGEXP_REPLACE(target, '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*', ''))) <= 50;

-- 5. Laporan: target yang TIDAK dipisah (bukan angka polos dan tanpa satuan). Betulkan di layar
--    Master Sasaran. Hasil kosong = semua terpisah.
SELECT 'Master Sasaran' AS tempat, id, tahun, 'Program' AS tingkat, target_program AS target
  FROM pk_sasaran
 WHERE satuan_program IS NULL AND target_program IS NOT NULL AND TRIM(target_program) <> ''
   AND target_program NOT REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*$'
UNION ALL
SELECT 'Master Sasaran', id, tahun, 'Kegiatan', target_kegiatan
  FROM pk_sasaran
 WHERE satuan_kegiatan IS NULL AND target_kegiatan IS NOT NULL AND TRIM(target_kegiatan) <> ''
   AND target_kegiatan NOT REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*$'
UNION ALL
SELECT 'Master Sasaran', id, tahun, 'Sub Kegiatan', target_subkegiatan
  FROM pk_sasaran
 WHERE satuan_subkegiatan IS NULL AND target_subkegiatan IS NOT NULL AND TRIM(target_subkegiatan) <> ''
   AND target_subkegiatan NOT REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*$'
UNION ALL
SELECT 'Dokumen DRAFT', l.id, d.tahun, l.level, l.target
  FROM pk_dokumen_lampiran l JOIN pk_dokumen d ON d.id = l.dokumen_id
 WHERE d.status = 'DRAFT' AND l.satuan IS NULL AND l.target IS NOT NULL AND TRIM(l.target) <> ''
   AND l.target NOT REGEXP '^[[:space:]]*[0-9]+([.,][0-9]+)*[[:space:]]*$';
