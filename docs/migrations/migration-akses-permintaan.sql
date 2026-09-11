-- migration-akses-permintaan.sql
-- Tahap 11 · P4 Permintaan Akses Mandiri. Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P4.
--
-- Orang yang butuh akses satu modul mengirim WhatsApp ke admin. Tidak ada antreannya,
-- alasannya tidak tercatat, tidak ada jejak siapa menyetujui — dan kalau adminnya cuti,
-- tidak ada yang tahu ada yang menunggu.
--
-- Tabel SENDIRI, bukan menumpang `promotion_requests`. Bentuk datanya beda (sasarannya
-- MODUL, bukan peran) dan aturannya beda (tanpa cooldown, tanpa probation, tanpa kata
-- sandi ulang — aturan 11.4). Menumpang berarti dua alur dengan aturan berbeda berbagi
-- satu kolom `status`, dan itu bentuk yang sudah dihukum sendiri di L88.
--
-- `alasan` VARCHAR(140), BUKAN 255. Angka itu bukan selera: alasan pemohon inilah yang
-- dipakai ulang sebagai alasan P9 saat admin menyetujui (§12 P9 — persetujuan TIDAK
-- ditanya alasannya lagi, "di sana alasannya sudah ditulis pemohon"), dan
-- `AlasanWewenangSchema` membatasi kolom itu 140. Kalau di sini boleh lebih panjang,
-- yang mendarat di jejak audit adalah potongan — dan alasan audit yang terpotong lebih
-- buruk daripada alasan yang pendek sejak awal.
--
-- `menunggu` GENERATED, bukan kolom biasa yang diisi kode. Ia ada semata supaya kunci
-- unik di bawahnya bisa berbunyi "satu permintaan MENUNGGU per orang per modul" tanpa
-- ikut melarang riwayat: NULL dianggap berbeda satu sama lain oleh indeks unik MySQL,
-- jadi baris DISETUJUI/DITOLAK boleh menumpuk berapa pun. Dibuat GENERATED supaya ia
-- MUSTAHIL berbeda pendapat dengan kolom `status` — kolom bayangan yang diisi tangan
-- cepat atau lambat tidak sinkron, dan begitu ia tidak sinkron kunci uniknya berhenti
-- menjaga apa pun tanpa satu gejala.
--
-- Kenapa kuncinya di DB dan bukan cukup "SELECT dulu, kalau sudah ada tolak": memeriksa
-- baris yang BELUM ADA tidak mengunci apa pun (L69-a), jadi dua klik beruntun
-- menghasilkan dua baris menunggu. Preseden yang persis sama sudah terjadi di
-- `migration-kinerja-uq-versi.sql` — pagar aplikasi hanya berlaku bagi yang lewat
-- aplikasi.
--
-- `ON DELETE CASCADE` pada `user_id`, sama dengan `akses_kedaluwarsa` dan karena alasan
-- yang sama: baris ini menerangkan PERTANYAAN YANG SEDANG MENGGANTUNG tentang sebuah
-- akun. Kalau akunnya tidak ada, tidak ada yang perlu dijawab. Riwayat putusannya hidup
-- di `audit_log`, bukan di sini.
--
-- Aman dijalankan pada basis data yang sudah punya tabelnya? TIDAK — MySQL menjawab
-- ER_TABLE_EXISTS_ERROR (1050). PERIKSA DULU (harus memulangkan 0 baris):
--
--   SELECT TABLE_NAME FROM information_schema.TABLES
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'akses_permintaan';

CREATE TABLE akses_permintaan (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  app_key         VARCHAR(64)  NOT NULL COMMENT 'Kunci modul di lib/registry/apps.ts.',
  alasan          VARCHAR(140) NOT NULL COMMENT 'Ditulis pemohon; dipakai ulang sebagai alasan P9 saat disetujui.',
  status          ENUM('MENUNGGU','DISETUJUI','DITOLAK') NOT NULL DEFAULT 'MENUNGGU',
  dibuat_pada     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diputus_pada    DATETIME     DEFAULT NULL,
  diputus_oleh    INT          DEFAULT NULL,
  catatan_putusan VARCHAR(255) DEFAULT NULL COMMENT 'Sebab penolakan — dibaca pemohon, wajib diisi saat menolak.',
  menunggu        TINYINT GENERATED ALWAYS AS (IF(status = 'MENUNGGU', 1, NULL)) STORED,
  UNIQUE KEY uq_akses_permintaan_menunggu (user_id, app_key, menunggu),
  KEY idx_ap_antrean (status, dibuat_pada),
  CONSTRAINT fk_ap_user  FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ap_oleh  FOREIGN KEY (diputus_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
