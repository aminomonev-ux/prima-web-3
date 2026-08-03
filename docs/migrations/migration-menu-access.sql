-- migration-menu-access.sql — Pengaturan akses menu per peran & per orang.
-- Konsep: docs/CONCEPT-menu-access-control.md §4.5
--
-- Dua tabel, dan keduanya dibuat KOSONG. Itu disengaja, bukan pekerjaan yang belum
-- selesai: selama sebuah baris tidak ada, jawabannya diambil dari `TABEL` di
-- lib/blud/peran.ts — aturan yang berlaku hari ini. Jadi sesudah migration ini
-- dijalankan, TIDAK ADA SATU PUN pengguna yang izinnya berubah.
--
-- Dua akibat baik dari memilih tabel kosong ketimbang menyalin 60 baris ke sini:
--   1. tidak ada kesempatan salah salin — aturan hanya hidup di satu tempat;
--   2. jalur cadangan ("baris tidak ada → pakai kode") terpakai di produksi sejak
--      hari pertama, jadi ia tidak bisa diam-diam rusak tanpa ketahuan.
--
-- Bentuknya PETA, bukan daftar: kunci utamanya menutup kemungkinan satu menu punya
-- dua nilai berbeda yang saling bertabrakan.

CREATE TABLE IF NOT EXISTS menu_role_access (
  app_key    VARCHAR(32)  NOT NULL                COMMENT 'Key modul, mis. "blud"',
  role       VARCHAR(32)  NOT NULL                COMMENT 'Nama peran, mis. "PERBENDAHARAAN"',
  menu_key   VARCHAR(64)  NOT NULL                COMMENT 'Key menu, mis. "blud.tutup_kas"',
  izin       ENUM('EDIT','LIHAT','TIDAK') NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT              NULL                COMMENT 'users.id yang terakhir mengubah',
  PRIMARY KEY (app_key, role, menu_key),
  INDEX idx_mra_app_role (app_key, role),
  CONSTRAINT fk_mra_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Aturan izin menu per PERAN — kosong = pakai bawaan dari kode';

-- Perkecualian per orang. Menang atas tabel peran di atas.
-- ON DELETE CASCADE menutup kebocoran yang tidak kelihatan: user dihapus, barisnya
-- ikut hilang. Tanpa itu, id yang dipakai ulang membuat pegawai baru mewarisi
-- kewenangan orang sebelumnya.
CREATE TABLE IF NOT EXISTS menu_user_access (
  user_id    INT          NOT NULL,
  app_key    VARCHAR(32)  NOT NULL,
  menu_key   VARCHAR(64)  NOT NULL,
  izin       ENUM('EDIT','LIHAT','TIDAK') NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT              NULL,
  PRIMARY KEY (user_id, app_key, menu_key),
  INDEX idx_mua_user_app (user_id, app_key),
  CONSTRAINT fk_mua_user       FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mua_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Perkecualian izin menu per ORANG — menang atas menu_role_access';
