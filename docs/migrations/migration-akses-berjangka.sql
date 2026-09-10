-- migration-akses-berjangka.sql
-- Tahap 10 · P2 Akses Berjangka. Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P2.
--
-- Akses sementara (pegawai magang, pengganti selama cuti, tim SPI saat pemeriksaan)
-- diberikan dengan niat "nanti dicabut", dan tidak pernah dicabut. Yang menumpuk bukan
-- pemberian yang salah, melainkan pemberian yang BENAR yang kelewat umurnya.
--
-- Tabel terpisah, BUKAN kolom di `users.app_access`. Bentuk larik datar itu dikunci di
-- §3 konsep dan dibaca God Node `hasAppAccess()`; menyelipkan tanggal ke dalamnya berarti
-- menyentuh fungsi yang dipakai hampir setiap route di aplikasi ini demi satu fitur yang
-- cuma menyangkut segelintir baris.
--
-- `berakhir_pada` DATE, bukan DATETIME: tenggatnya sebuah HARI. Menyimpan jam membuat
-- "berakhir 30 Sep" punya dua jawaban berbeda tergantung zona waktu sesi MySQL, dan
-- satu-satunya yang dipakai perbandingannya adalah `CURDATE()`.
--
-- UNIQUE (user_id, app_key): satu tenggat per orang per modul. Baris kedua berarti dua
-- jawaban untuk "sampai kapan", dan yang satu pasti mulai berbeda dari yang lain (L88).
--
-- `ON DELETE CASCADE` pada user_id — kebalikan `audit_log.target_user_id` yang sengaja
-- tanpa FK, dan sekali lagi karena yang dijaga berbeda: baris ini menerangkan KEADAAN
-- SEKARANG sebuah grant. Kalau akunnya sudah tidak ada, tidak ada apa pun yang perlu
-- kedaluwarsa. Riwayatnya hidup di `audit_log`, bukan di sini.
--
-- `diingatkan_pada` ada karena server PRIMA adalah laptop kantor yang dimatikan tiap
-- malam: cron BISA terlewat sehari, jadi pengingatnya tidak boleh berpatokan pada
-- "tepat H-3" (hari itu mungkin tidak pernah terjadi). Ia bertanya "sudah ≤3 hari lagi
-- DAN belum pernah diingatkan", dan kolom inilah yang membuat pertanyaan kedua bisa
-- dijawab tanpa mengirim dua kali.
--
-- Aman dijalankan pada basis data yang sudah punya tabelnya? TIDAK — MySQL menjawab
-- ER_TABLE_EXISTS_ERROR (1050). PERIKSA DULU (harus memulangkan 0 baris):
--
--   SELECT TABLE_NAME FROM information_schema.TABLES
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'akses_kedaluwarsa';

CREATE TABLE akses_kedaluwarsa (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  app_key         VARCHAR(64)  NOT NULL COMMENT 'Kunci modul di lib/registry/apps.ts.',
  berakhir_pada   DATE         NOT NULL COMMENT 'Hari TERAKHIR akses masih berlaku.',
  alasan          VARCHAR(255) NOT NULL COMMENT 'Kenapa dipinjamkan — dibaca saat memutuskan perpanjangan.',
  dibuat_oleh     INT          DEFAULT NULL,
  dibuat_pada     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diingatkan_pada DATE         DEFAULT NULL COMMENT 'Kapan pengingat H-3 dikirim. NULL = belum.',
  UNIQUE KEY uq_akses_kedaluwarsa (user_id, app_key),
  KEY idx_ak_berakhir (berakhir_pada),
  CONSTRAINT fk_ak_user FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ak_oleh FOREIGN KEY (dibuat_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
