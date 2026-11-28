-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- JALANKAN migrasi BBA paket Jumat 2026-11-27 — MENGUBAH STRUKTUR DATABASE. Dirakit apa adanya dari berkas
-- migrasi aslinya (tidak ada isi yang diubah), berurutan:
--   BAGIAN 0  migration-bba-penawaran.sql          (Kamis 26 Nov — prasyarat bagian 2 & 3)
--   BAGIAN 1  migration-bba-drive-potret.sql       (Jumat 27 Nov, Drive balik)
--   BAGIAN 2  migration-bba-master-kategori.sql    (Jumat 27 Nov, Master Kategori 2 tingkat)
--   BAGIAN 3  migration-bba-penawaran-matriks.sql  (Jumat 27 Nov, Penawaran = Matriks Inventarisasi)
--
-- CARA PAKAI (di server kantor, SEBELUM `git pull` / build kode baru):
--   1. Cadangkan dulu:   mysqldump -u prima -p prima_db > D:\cadangan\prima_db-sebelum-paket-2026-11-27.sql
--   2. Jalankan paket-2026-11-27-cek.sql. Lihat "Hasil 2" (ringkasan per migrasi).
--   3. Di berkas INI, HAPUS / beri komentar bagian yang hasil cek-nya "SUDAH". Bagian "SEBAGIAN" = berhenti, laporkan.
--      Perintah ALTER ... ADD COLUMN tidak bisa diulang: menjalankan bagian yang sudah ada = galat "Duplicate column".
--   4. Jalankan berkas ini (HeidiSQL: buka berkas → Execute; atau mysql -u prima -p prima_db < paket-2026-11-27-jalankan.sql).
--      Berhenti di galat pertama — perintah DDL MySQL langsung tersimpan, jadi JANGAN diulang dari awal; jalankan cek lagi
--      untuk melihat bagian mana yang sudah masuk, lalu laporkan galatnya.
--   5. Jalankan paket-2026-11-27-cek.sql lagi: semua harus "SUDAH". Baru git pull + npm run build + pm2 restart.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════


-- ███████████████████████████████████████████████████████████████████████████████████████████████████
-- BAGIAN 0 — migration-bba-penawaran.sql   (lewati bila cek berkata SUDAH)
-- ███████████████████████████████████████████████████████████████████████████████████████████████████

-- BBA revamp Tahap 5 — Penawaran Rekanan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: menu Penawaran, "Ambil dari penawaran" di referensi
-- harga, hapus/gabung barang, dan Simpan referensi membaca tabel & kolom ini. Tanpa data awal (tabel baru kosong).
--
-- Penawaran = gudang harga dari rekanan; yang dipakai rencana DISALIN ke bba_referensi_harga (referensi beku sejak
-- dipesan), `penawaran_item_id` hanya jejak salinan (soft-FK — penawaran boleh dihapus, referensinya tetap utuh).

CREATE TABLE bba_penawaran (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rekanan        VARCHAR(160) NOT NULL,
  nomor_surat    VARCHAR(120) NULL,
  tgl_surat      DATE         NOT NULL,
  berlaku_sampai DATE         NULL COMMENT 'NULL = tanpa batas tertulis',
  kategori       VARCHAR(80)  NULL,
  file_id        VARCHAR(64)  NULL COMMENT 'Soft-FK uploaded_files.file_id (context buku_besar_aset) — berkas surat',
  catatan        VARCHAR(500) NULL,
  version        INT UNSIGNED NOT NULL DEFAULT 0,
  created_by     INT          NULL,
  updated_by     INT          NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bpw_tgl (tgl_surat),
  KEY idx_bpw_rekanan (rekanan),
  CONSTRAINT fk_bpw_dibuat FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_bpw_diubah FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — surat penawaran rekanan (gudang harga untuk referensi rencana)';

CREATE TABLE bba_penawaran_item (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  penawaran_id BIGINT UNSIGNED NOT NULL,
  barang_id    INT UNSIGNED  NULL COMMENT 'NULL = belum ditautkan ke Master Barang',
  nama_barang  VARCHAR(255)  NOT NULL COMMENT 'Teks asli di surat',
  merk_tipe    VARCHAR(160)  NULL,
  spesifikasi  VARCHAR(500)  NULL,
  satuan       VARCHAR(40)   NULL,
  harga_satuan DECIMAL(18,2) NOT NULL,
  urutan       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_bpwi_penawaran (penawaran_id, urutan),
  KEY idx_bpwi_barang (barang_id),
  CONSTRAINT fk_bpwi_penawaran FOREIGN KEY (penawaran_id) REFERENCES bba_penawaran(id) ON DELETE CASCADE,
  CONSTRAINT fk_bpwi_barang FOREIGN KEY (barang_id) REFERENCES bba_barang(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — item per surat penawaran; dibandingkan per barang × satuan';

ALTER TABLE bba_referensi_harga
  ADD COLUMN penawaran_item_id BIGINT UNSIGNED NULL COMMENT 'Soft-FK bba_penawaran_item.id — jejak salinan dari penawaran' AFTER file_id;


-- ███████████████████████████████████████████████████████████████████████████████████████████████████
-- BAGIAN 1 — migration-bba-drive-potret.sql   (lewati bila cek berkata SUDAH)
-- ███████████████████████████████████████████████████████████████████████████████████████████████████

-- BBA — perubahan laporan di Google Drive dibawa balik ke PRIMA (docs/konsep/bba/CONCEPT-bba-drive-balik.md §6A).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: cron salinan Drive menulis potret tiap kiriman ke tabel ini,
-- dan tinjauan perubahan Drive membacanya. Tanpa data awal (tabel baru kosong); kiriman pertama sesudah kode terpasang
-- mengisinya.
--
-- Potret = isi kolom yang bisa dibawa balik (bentuk baku, per lembar, per id) dari SATU kiriman PRIMA ke Drive. Dipakai
-- sebagai "asal" gabung tiga arah: apa yang dibuka pengubah di Drive, dibanding isi berkas sesudah ia menyimpan dan isi
-- PRIMA sekarang. Bukan berkas Excel-nya. Tidak dirujuk tabel lain; dipangkas aplikasi (≤ 20 per berkas, sesudah
-- tinjauan selesai tinggal yang terbaru).

CREATE TABLE bba_drive_potret (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kunci        VARCHAR(40)  NOT NULL COMMENT 'Kunci berkas laporan, mis. rencana:2026',
  md5          CHAR(32)     NOT NULL COMMENT 'md5Checksum isi berkas yang diunggah (jawaban Drive)',
  revisi       VARCHAR(255) NULL     COMMENT 'headRevisionId hasil unggahan',
  dikirim_pada DATETIME     NOT NULL,
  isi          JSON         NOT NULL COMMENT 'Potret bentuk baku: lembar → id → kolom → nilai (lib/bba/drive-balik.ts)',
  PRIMARY KEY (id),
  KEY idx_bdp_kunci (kunci, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — potret tiap kiriman laporan ke Drive (asal gabung tiga arah)';


-- ███████████████████████████████████████████████████████████████████████████████████████████████████
-- BAGIAN 2 — migration-bba-master-kategori.sql   (lewati bila cek berkata SUDAH)
-- ███████████████████████████████████████████████████████████████████████████████████████████████████

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


-- ███████████████████████████████████████████████████████████████████████████████████████████████████
-- BAGIAN 3 — migration-bba-penawaran-matriks.sql   (lewati bila cek berkata SUDAH)
-- ███████████████████████████████████████████████████████████████████████████████████████████████████

-- BBA — Penawaran Rekanan mengikuti Matriks Inventarisasi (docs/konsep/bba/CONCEPT-bba-penawaran-matriks.md §7).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: daftar Penawaran, Ambil dari penawaran, unduhan Excel,
-- dan salinan Drive membaca kolom-kolom ini. Tanpa data awal — surat lama tampil seperti sebelumnya.

ALTER TABLE bba_penawaran
  ADD COLUMN jenis_surat          VARCHAR(80)  NULL COMMENT 'Jenis surat (daftar Matriks atau ketik sendiri); NULL = dianggap surat berharga' AFTER berlaku_sampai,
  ADD COLUMN pic_kontak           VARCHAR(255) NULL COMMENT 'PIC & kontak rekanan pada surat ini' AFTER rekanan,
  ADD COLUMN masa_berlaku_teks    VARCHAR(60)  NULL COMMENT 'Bunyi masa berlaku di surat ("14 (empat belas) hari"); penentu tetap berlaku_sampai' AFTER berlaku_sampai,
  ADD COLUMN status_tindak_lanjut ENUM('MENUNGGU_PRESENTASI','MENUNGGU_DEMO','PERLU_TELAAH','LANJUT','ARSIP','DITOLAK') NULL AFTER catatan,
  MODIFY COLUMN catatan           VARCHAR(1000) NULL COMMENT 'Syarat & pengecualian';

ALTER TABLE bba_penawaran_item
  ADD COLUMN merk         VARCHAR(80)  NULL COMMENT 'Merk; merk_tipe kini berarti Tipe' AFTER nama_barang,
  ADD COLUMN status_pajak ENUM('TERMASUK','BELUM','BEBAS','TIDAK_DISEBUT') NULL AFTER harga_satuan,
  ADD COLUMN tautan       VARCHAR(500) NULL COMMENT 'Link e-Katalog / referensi — ikut tersalin ke referensi rencana' AFTER status_pajak,
  ADD COLUMN garansi      VARCHAR(120) NULL AFTER tautan,
  MODIFY COLUMN harga_satuan DECIMAL(18,2) NULL COMMENT 'NULL = surat belum mencantumkan harga';

-- Selesai. Jalankan paket-2026-11-27-cek.sql lagi — semua harus SUDAH.
