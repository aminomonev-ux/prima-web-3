-- migration-bba-master-kategori.sql
-- Master Kategori 2 Tingkat BBA (Barang dan Jasa, Modal, Pegawai + kustom)
-- beserta Jenis Kategori, Kode Rekening (dari Master Akun / Kode Besar BLUD), dan Kelompok KIB khusus Modal.
-- MySQL 8.4. Jalankan sekali sebelum deploy kode Master Kategori 2 tingkat.

-- 1. Kategori Induk (Barang dan Jasa, Modal, Pegawai, atau kustom)
CREATE TABLE IF NOT EXISTS bba_kategori_induk (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama       VARCHAR(100) NOT NULL,
  bawaan     TINYINT(1)   NOT NULL DEFAULT 0,
  urutan     INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_kat_induk_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Master kategori induk BBA (Barang dan Jasa, Modal, Pegawai, kustom)';

INSERT IGNORE INTO bba_kategori_induk (nama, bawaan, urutan) VALUES
  ('Barang dan Jasa', 1, 1),
  ('Modal',           1, 2),
  ('Pegawai',         1, 3);

-- 2. Master Kelompok KIB (khusus kategori Modal; 6 bawaan + dapat ditambah manual)
CREATE TABLE IF NOT EXISTS bba_kelompok_kib (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama       VARCHAR(128) NOT NULL,
  bawaan     TINYINT(1)   NOT NULL DEFAULT 0,
  urutan     INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_kelompok_kib_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Master kelompok KIB BBA untuk kategori Modal (6 bawaan + kustom)';

INSERT IGNORE INTO bba_kelompok_kib (nama, bawaan, urutan) VALUES
  ('TANAH',                              1, 1),
  ('PERALATAN DAN MESIN',                1, 2),
  ('GEDUNG DAN BANGUNAN',                1, 3),
  ('JALAN, IRIGASI, DAN JARINGAN',       1, 4),
  ('KONSTRUKSI DALAM PENGERJAAN (KDP)', 1, 5),
  ('ALKES & ALDOK',                      1, 6);

-- 3. Evolusi bba_kategori_aset menjadi tabel Jenis Kategori (level 2)
--    6 kategori KIB lama dimigrasikan aman ke bawah induk "Modal".
ALTER TABLE bba_kategori_aset
  DROP INDEX uq_bba_kategori_nama,
  ADD COLUMN kategori_id   INT UNSIGNED NULL AFTER id,
  MODIFY COLUMN nama       VARCHAR(255) NOT NULL,
  ADD COLUMN kode_rekening VARCHAR(64)  NULL AFTER nama,
  ADD COLUMN kelompok_kib  VARCHAR(128) NULL AFTER kode_rekening;

UPDATE bba_kategori_aset k
   SET k.kategori_id = (SELECT id FROM bba_kategori_induk WHERE nama = 'Modal' LIMIT 1),
       k.kelompok_kib = CASE
         WHEN UPPER(TRIM(k.nama)) IN (
           'TANAH',
           'PERALATAN DAN MESIN',
           'GEDUNG DAN BANGUNAN',
           'JALAN, IRIGASI, DAN JARINGAN',
           'KONSTRUKSI DALAM PENGERJAAN (KDP)',
           'ALKES & ALDOK'
         ) THEN UPPER(TRIM(k.nama))
         ELSE k.nama
       END
 WHERE k.kategori_id IS NULL;

INSERT IGNORE INTO bba_kelompok_kib (nama, bawaan, urutan)
SELECT DISTINCT kelompok_kib, 0, 99
  FROM bba_kategori_aset
 WHERE kelompok_kib IS NOT NULL AND kelompok_kib <> '';

ALTER TABLE bba_kategori_aset
  MODIFY COLUMN kategori_id INT UNSIGNED NOT NULL,
  ADD KEY idx_bka_induk (kategori_id),
  ADD KEY idx_bka_induk_nama (kategori_id, nama),
  ADD KEY idx_bka_kode (kode_rekening),
  ADD KEY idx_bka_kelompok_kib (kelompok_kib),
  ADD CONSTRAINT fk_bka_induk FOREIGN KEY (kategori_id) REFERENCES bba_kategori_induk(id) ON DELETE RESTRICT;

-- 4. Master Barang: struktur kategori 2 tingkat + kode rekening + kelompok_kib
ALTER TABLE bba_barang
  ADD COLUMN kategori_id       INT UNSIGNED NULL AFTER kategori_aset,
  ADD COLUMN jenis_kategori_id INT UNSIGNED NULL AFTER kategori_id,
  ADD COLUMN kategori          VARCHAR(100) NULL AFTER jenis_kategori_id,
  ADD COLUMN jenis_kategori    VARCHAR(255) NULL AFTER kategori,
  ADD COLUMN kode_rekening     VARCHAR(64)  NULL AFTER jenis_kategori,
  ADD COLUMN kelompok_kib      VARCHAR(128) NULL AFTER kode_rekening,
  ADD KEY idx_bbg_kat_id (kategori_id),
  ADD KEY idx_bbg_jenis_id (jenis_kategori_id),
  ADD KEY idx_bbg_kategori (kategori);

UPDATE bba_barang g
LEFT JOIN bba_kategori_aset k ON LOWER(TRIM(k.nama)) = LOWER(TRIM(g.kategori_aset))
   SET g.kategori_id       = (SELECT id FROM bba_kategori_induk WHERE nama = 'Modal' LIMIT 1),
       g.jenis_kategori_id = k.id,
       g.kategori          = 'Modal',
       g.jenis_kategori    = g.kategori_aset,
       g.kode_rekening     = k.kode_rekening,
       g.kelompok_kib      = COALESCE(k.kelompok_kib, CASE
         WHEN UPPER(TRIM(g.kategori_aset)) IN (
           'TANAH',
           'PERALATAN DAN MESIN',
           'GEDUNG DAN BANGUNAN',
           'JALAN, IRIGASI, DAN JARINGAN',
           'KONSTRUKSI DALAM PENGERJAAN (KDP)',
           'ALKES & ALDOK'
         ) THEN UPPER(TRIM(g.kategori_aset))
         ELSE NULL
       END)
 WHERE g.kategori_aset IS NOT NULL AND TRIM(g.kategori_aset) <> '' AND g.kategori IS NULL;

-- 5. Rencana / Pengadaan BBA (buku_besar_aset)
ALTER TABLE buku_besar_aset
  ADD COLUMN kategori_id       INT UNSIGNED NULL AFTER kategori_aset,
  ADD COLUMN jenis_kategori_id INT UNSIGNED NULL AFTER kategori_id,
  ADD COLUMN kategori          VARCHAR(100) NULL AFTER jenis_kategori_id,
  ADD COLUMN jenis_kategori    VARCHAR(255) NULL AFTER kategori,
  ADD COLUMN kelompok_kib      VARCHAR(128) NULL AFTER jenis_kategori,
  ADD KEY idx_bba_kat_id (kategori_id),
  ADD KEY idx_bba_jenis_id (jenis_kategori_id),
  ADD KEY idx_bba_kategori (kategori),
  ADD KEY idx_bba_kode_rek (kode_rekening);

UPDATE buku_besar_aset b
LEFT JOIN bba_kategori_aset k ON LOWER(TRIM(k.nama)) = LOWER(TRIM(b.kategori_aset))
   SET b.kategori_id       = (SELECT id FROM bba_kategori_induk WHERE nama = 'Modal' LIMIT 1),
       b.jenis_kategori_id = k.id,
       b.kategori          = 'Modal',
       b.jenis_kategori    = b.kategori_aset,
       b.kode_rekening     = COALESCE(NULLIF(TRIM(b.kode_rekening), ''), k.kode_rekening),
       b.kelompok_kib      = COALESCE(k.kelompok_kib, CASE
         WHEN UPPER(TRIM(b.kategori_aset)) IN (
           'TANAH',
           'PERALATAN DAN MESIN',
           'GEDUNG DAN BANGUNAN',
           'JALAN, IRIGASI, DAN JARINGAN',
           'KONSTRUKSI DALAM PENGERJAAN (KDP)',
           'ALKES & ALDOK'
         ) THEN UPPER(TRIM(b.kategori_aset))
         ELSE NULL
       END)
 WHERE b.kategori_aset IS NOT NULL AND TRIM(b.kategori_aset) <> '' AND b.kategori IS NULL;

UPDATE buku_besar_aset
   SET kategori_id = (SELECT id FROM bba_kategori_induk WHERE nama = 'Modal' LIMIT 1),
       kategori    = 'Modal'
 WHERE origin = 'USULAN' AND kategori IS NULL;

-- 6. Penawaran Rekanan (bba_penawaran)
ALTER TABLE bba_penawaran
  ADD COLUMN kategori_id       INT UNSIGNED NULL AFTER berlaku_sampai,
  ADD COLUMN jenis_kategori_id INT UNSIGNED NULL AFTER kategori_id,
  MODIFY COLUMN kategori       VARCHAR(100) NULL,
  ADD COLUMN jenis_kategori    VARCHAR(255) NULL AFTER kategori,
  ADD COLUMN kode_rekening     VARCHAR(64)  NULL AFTER jenis_kategori,
  ADD COLUMN kelompok_kib      VARCHAR(128) NULL AFTER kode_rekening,
  ADD KEY idx_bpw_kat_id (kategori_id),
  ADD KEY idx_bpw_jenis_id (jenis_kategori_id),
  ADD KEY idx_bpw_kategori (kategori);

UPDATE bba_penawaran w
JOIN bba_kategori_aset k ON LOWER(TRIM(k.nama)) = LOWER(TRIM(w.kategori))
   SET w.kategori_id       = k.kategori_id,
       w.jenis_kategori_id = k.id,
       w.kategori          = 'Modal',
       w.jenis_kategori    = k.nama,
       w.kode_rekening     = COALESCE(NULLIF(TRIM(w.kode_rekening), ''), k.kode_rekening),
       w.kelompok_kib      = k.kelompok_kib
 WHERE w.kategori IS NOT NULL AND w.jenis_kategori IS NULL;

-- Kategori surat dulu isian bebas ("alkes, komputer, mebel…"). Teks yang bukan nama kategori induk
-- dipindah ke jenis_kategori: dibiarkan di kolom kategori, ia terbaca sebagai induk yang tidak ada
-- dan Simpan surat berikutnya ditolak "Kategori … tidak ditemukan".
UPDATE bba_penawaran w
   SET w.jenis_kategori = w.kategori,
       w.kategori       = NULL
 WHERE w.kategori IS NOT NULL AND w.kategori_id IS NULL AND w.jenis_kategori IS NULL
   AND NOT EXISTS (SELECT 1 FROM bba_kategori_induk i WHERE LOWER(TRIM(i.nama)) = LOWER(TRIM(w.kategori)));
