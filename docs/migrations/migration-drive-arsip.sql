-- migration-drive-arsip.sql — catatan unggahan Drive (manifest) + kesehatan per tujuan.
-- Konsep: docs/CONCEPT-drive-terpusat.md §5.2, §5.3, Tahap 2.
-- Aman dijalankan sebelum kodenya dipasang dan aman diulang (CREATE TABLE IF NOT EXISTS).
-- Kode yang sudah terpasang TANPA tabel ini tetap jalan: pencatatan gagal diam-diam,
-- rotasi backup jatuh ke cara lama (berdasarkan nama berkas).

CREATE TABLE IF NOT EXISTS drive_arsip (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tujuan        VARCHAR(40)  NOT NULL,           -- 'backup_db' | 'lkjip' | 'lkjip_arsip' | 'blud_json' | 'bba' | 'usulan'
  file_id       VARCHAR(64)  NOT NULL,
  nama          VARCHAR(255) NOT NULL,
  ukuran        BIGINT UNSIGNED NULL,            -- byte, dari Drive
  sha256        CHAR(64)     NULL,               -- hash berkas YANG DIUNGGAH (backup: .sql.gz.enc, bukan dump polos)
  folder_id     VARCHAR(64)  NULL,               -- folder tempat ia ditaruh
  sumber        VARCHAR(20)  NOT NULL DEFAULT 'aplikasi', -- 'aplikasi' | 'backup_db'
  dibuat_pada   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dihapus_pada  DATETIME     NULL,               -- diisi rotasi; baris TIDAK dihapus
  PRIMARY KEY (id),
  UNIQUE KEY uq_drive_arsip_file (file_id),
  KEY idx_drive_arsip_tujuan (tujuan, dibuat_pada),
  KEY idx_drive_arsip_hapus (dihapus_pada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS drive_health (
  tujuan            VARCHAR(40)  NOT NULL,
  terakhir_ok_at    DATETIME     NULL,
  terakhir_gagal_at DATETIME     NULL,
  pesan             VARCHAR(255) NULL,           -- pesan kegagalan terakhir
  kode              VARCHAR(40)  NULL,           -- 'quota' | 'permission' | 'notfound' | 'token' | 'jaringan' | 'lain'
  jumlah_ok         INT UNSIGNED NOT NULL DEFAULT 0,
  jumlah_gagal      INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (tujuan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
