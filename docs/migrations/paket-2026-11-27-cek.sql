-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- CEK migrasi BBA paket Jumat 2026-11-27 — HANYA MEMBACA (SELECT ke information_schema), aman dijalankan kapan saja,
-- sebelum DAN sesudah `paket-2026-11-27-jalankan.sql`. Jalankan di database PRIMA (mis. HeidiSQL, pilih prima_db dulu;
-- atau: mysql -u prima -p prima_db < paket-2026-11-27-cek.sql).
--
-- Hasil 1 = per objek (tabel/kolom/indeks) yang dibuat tiap migrasi: SUDAH / BELUM.
-- Hasil 2 = ringkasan per migrasi:
--   SUDAH    → bagian itu di berkas "jalankan" DILEWATI.
--   BELUM    → bagian itu DIJALANKAN.
--   SEBAGIAN → JANGAN jalankan bagian itu utuh (ALTER-nya akan gagal "Duplicate column"); kirim hasil cek ini dulu.
-- Hasil 3 = prasyarat lama yang harus sudah ada sebelum paket ini.
--
-- Urutan migrasi: 0 (Kamis, prasyarat) → 1 → 2 → 3. Migrasi 2 mengubah tabel bba_penawaran yang dibuat migrasi 0.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════

SELECT DATABASE() AS `database yang dicek`, VERSION() AS `versi MySQL`;

-- ── Hasil 1: per objek ────────────────────────────────────────────────────────────────────────────────
SELECT x.urut, x.migrasi, x.objek, IF(x.ada, 'SUDAH', 'BELUM') AS status
FROM (
  -- 0. migration-bba-penawaran.sql (Kamis 26 Nov — prasyarat migrasi 2 & 3)
  SELECT 0 AS urut, 'migration-bba-penawaran.sql' AS migrasi, 'tabel bba_penawaran' AS objek,
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran') AS ada
  UNION ALL SELECT 0, 'migration-bba-penawaran.sql', 'tabel bba_penawaran_item',
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran_item')
  UNION ALL SELECT 0, 'migration-bba-penawaran.sql', 'kolom bba_referensi_harga.penawaran_item_id',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_referensi_harga' AND COLUMN_NAME = 'penawaran_item_id')

  -- 1. migration-bba-drive-potret.sql
  UNION ALL SELECT 1, 'migration-bba-drive-potret.sql', 'tabel bba_drive_potret',
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_drive_potret')

  -- 2. migration-bba-master-kategori.sql
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'tabel bba_kategori_induk',
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_kategori_induk')
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'tabel bba_kelompok_kib',
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_kelompok_kib')
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'kolom bba_kategori_aset.kategori_id',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_kategori_aset' AND COLUMN_NAME = 'kategori_id')
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'foreign key bba_kategori_aset.fk_bka_induk',
         EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_kategori_aset' AND CONSTRAINT_NAME = 'fk_bka_induk')
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'kolom bba_barang.kategori_id',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_barang' AND COLUMN_NAME = 'kategori_id')
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'kolom buku_besar_aset.kategori_id',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buku_besar_aset' AND COLUMN_NAME = 'kategori_id')
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'indeks buku_besar_aset.idx_bba_kode_rek',
         EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buku_besar_aset' AND INDEX_NAME = 'idx_bba_kode_rek')
  UNION ALL SELECT 2, 'migration-bba-master-kategori.sql', 'kolom bba_penawaran.kategori_id',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran' AND COLUMN_NAME = 'kategori_id')

  -- 3. migration-bba-penawaran-matriks.sql
  UNION ALL SELECT 3, 'migration-bba-penawaran-matriks.sql', 'kolom bba_penawaran.jenis_surat',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran' AND COLUMN_NAME = 'jenis_surat')
  UNION ALL SELECT 3, 'migration-bba-penawaran-matriks.sql', 'kolom bba_penawaran.pic_kontak',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran' AND COLUMN_NAME = 'pic_kontak')
  UNION ALL SELECT 3, 'migration-bba-penawaran-matriks.sql', 'kolom bba_penawaran.status_tindak_lanjut',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran' AND COLUMN_NAME = 'status_tindak_lanjut')
  UNION ALL SELECT 3, 'migration-bba-penawaran-matriks.sql', 'kolom bba_penawaran_item.merk',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran_item' AND COLUMN_NAME = 'merk')
  UNION ALL SELECT 3, 'migration-bba-penawaran-matriks.sql', 'kolom bba_penawaran_item.tautan',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran_item' AND COLUMN_NAME = 'tautan')
  UNION ALL SELECT 3, 'migration-bba-penawaran-matriks.sql', 'bba_penawaran_item.harga_satuan boleh kosong (NULL)',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_penawaran_item' AND COLUMN_NAME = 'harga_satuan' AND IS_NULLABLE = 'YES')
) x
ORDER BY x.urut, x.objek;

-- ── Hasil 2: ringkasan per migrasi ────────────────────────────────────────────────────────────────────
SELECT r.urut, r.migrasi,
       CASE WHEN r.sudah = r.total THEN 'SUDAH — lewati bagian ini'
            WHEN r.sudah = 0       THEN 'BELUM — jalankan bagian ini'
            ELSE CONCAT('SEBAGIAN (', r.sudah, '/', r.total, ') — JANGAN dijalankan utuh, laporkan dulu') END AS tindakan
FROM (
  SELECT 0 AS urut, 'migration-bba-penawaran.sql' AS migrasi, 3 AS total,
         (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('bba_penawaran', 'bba_penawaran_item'))
       + (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_referensi_harga' AND COLUMN_NAME = 'penawaran_item_id') AS sudah
  UNION ALL
  SELECT 1, 'migration-bba-drive-potret.sql', 1,
         (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_drive_potret')
  UNION ALL
  SELECT 2, 'migration-bba-master-kategori.sql', 8,
         (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('bba_kategori_induk', 'bba_kelompok_kib'))
       + (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'kategori_id'
            AND TABLE_NAME IN ('bba_kategori_aset', 'bba_barang', 'buku_besar_aset', 'bba_penawaran'))
       + (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_kategori_aset' AND CONSTRAINT_NAME = 'fk_bka_induk')
       + (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buku_besar_aset' AND INDEX_NAME = 'idx_bba_kode_rek')
  UNION ALL
  SELECT 3, 'migration-bba-penawaran-matriks.sql', 6,
         (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
            AND ((TABLE_NAME = 'bba_penawaran' AND COLUMN_NAME IN ('jenis_surat', 'pic_kontak', 'status_tindak_lanjut'))
              OR (TABLE_NAME = 'bba_penawaran_item' AND COLUMN_NAME IN ('merk', 'tautan'))
              OR (TABLE_NAME = 'bba_penawaran_item' AND COLUMN_NAME = 'harga_satuan' AND IS_NULLABLE = 'YES')))
) r
ORDER BY r.urut;

-- ── Hasil 3: prasyarat lama (dari migrasi sebelum minggu ini) — semuanya harus ADA ───────────────────────
-- "uq_bba_kategori_nama" khusus: harus ADA bila migrasi 2 masih BELUM (migrasi 2 membuangnya); sesudah migrasi 2 = hilang, itu benar.
SELECT p.prasyarat, IF(p.ada, 'ADA', 'TIDAK ADA') AS status, p.dari
FROM (
  SELECT 'tabel bba_kategori_aset' AS prasyarat, 'migration-bba-kategori-master.sql' AS dari,
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_kategori_aset') AS ada
  UNION ALL SELECT 'indeks bba_kategori_aset.uq_bba_kategori_nama (lihat catatan)', 'migration-bba-kategori-master.sql',
         EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_kategori_aset' AND INDEX_NAME = 'uq_bba_kategori_nama')
  UNION ALL SELECT 'tabel bba_barang + kolom kategori_aset', 'migration-bba-barang-proses.sql',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_barang' AND COLUMN_NAME = 'kategori_aset')
  UNION ALL SELECT 'kolom buku_besar_aset.kode_rekening', 'migration-inventaris-modal.sql',
         EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buku_besar_aset' AND COLUMN_NAME = 'kode_rekening')
  UNION ALL SELECT 'tabel bba_referensi_harga', 'migration-bba-referensi-bukti.sql',
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bba_referensi_harga')
  UNION ALL SELECT 'tabel users (rujukan foreign key)', 'schema-mysql.sql',
         EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users')
) p;
