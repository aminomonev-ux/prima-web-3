-- migration-uploaded-files-modul.sql — Fase F, pertanyaan akhir nomor 5 (docs/CONCEPT-perbaikan-audit-akses.md).
--
-- `/api/upload/download` kini tunduk sakelar modul pemilik berkas. Modulnya dibaca dari
-- `uploaded_files.context`, yang sejak perubahan ini diisi `/api/upload` ('lkjip' |
-- 'usulan_aset'). Kolomnya sudah ada sejak L61 tapi TIDAK PERNAH diisi (tak satu pemanggil
-- pun mengirim `context`), jadi semua baris lama bernilai NULL — dan NULL berarti "tanya
-- sakelar SEMUA modul pengunggah": LKJIP dalam pemeliharaan ikut menutup unduhan lampiran
-- Usulan. Migrasi ini mengisi baris lama dari tabel yang merujuknya.
--
-- Tanpa ALTER, tanpa kolom baru. Hanya baris ber-context NULL yang disentuh; aman diulang.
-- Berkas yang tidak dirujuk mana pun tetap NULL (sengaja: lebih membatasi daripada menebak).
--
-- COLLATE eksplisit WAJIB: `uploaded_files` lahir dengan collation bawaan server
-- (utf8mb4_0900_ai_ci) sedangkan `usulan_items` utf8mb4_unicode_ci — tanpa itu MySQL menolak
-- LIKE-nya dengan ER_CANT_AGGREGATE_2COLLATIONS (terbukti di basis data pengembangan).

-- Lampiran item Usulan: file_url berbentuk '/api/upload/download?id=<file_id>'.
UPDATE uploaded_files f
   SET f.context = 'usulan_aset'
 WHERE f.context IS NULL
   AND EXISTS (
     SELECT 1 FROM usulan_items i
      WHERE i.file_url LIKE CONCAT('%download?id=', f.file_id, '%') COLLATE utf8mb4_unicode_ci
   );

-- Gambar & grafik LKJIP: payload blok GAMBAR menyimpan `fileId`, GRAFIK `imageFileId`.
UPDATE uploaded_files f
   SET f.context = 'lkjip'
 WHERE f.context IS NULL
   AND EXISTS (
     SELECT 1 FROM lkjip_block b
      WHERE JSON_UNQUOTE(JSON_EXTRACT(b.payload, '$.fileId'))      = f.file_id COLLATE utf8mb4_unicode_ci
         OR JSON_UNQUOTE(JSON_EXTRACT(b.payload, '$.imageFileId')) = f.file_id COLLATE utf8mb4_unicode_ci
   );

-- Pemeriksaan sesudahnya (baca saja):
-- SELECT context, COUNT(*) FROM uploaded_files GROUP BY context;
