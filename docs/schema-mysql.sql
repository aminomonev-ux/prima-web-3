-- ═══════════════════════════════════════════════════════════════════════════
-- PRIMA — Database Schema Lengkap (MySQL 8.0.13+)
-- Mencakup: Usulan Kebutuhan + E-Anggaran + Security
-- Copy-paste langsung ke HeidiSQL / MySQL Workbench untuk DB baru
-- ═══════════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS prima_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE prima_db;

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  INT             NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username            VARCHAR(50)     NOT NULL UNIQUE,
  email               VARCHAR(100)    NOT NULL UNIQUE,
  password_hash       VARCHAR(255)    NOT NULL,
  nama_lengkap        VARCHAR(100)    DEFAULT NULL,
  role                VARCHAR(50)     NOT NULL DEFAULT 'UMUM',
  status              VARCHAR(20)     NOT NULL DEFAULT 'MENUNGGU',
  email_verified      TINYINT(1)      NOT NULL DEFAULT 0,
  email_verify_token  VARCHAR(255)    DEFAULT NULL,
  email_verify_expiry DATETIME        DEFAULT NULL,
  reset_token         VARCHAR(255)    DEFAULT NULL,
  reset_token_expiry  DATETIME        DEFAULT NULL,
  failed_attempts     INT             NOT NULL DEFAULT 0,
  locked_until        DATETIME        DEFAULT NULL,
  last_login          DATETIME        DEFAULT NULL,
  app_access          JSON            DEFAULT NULL,
  theme_preference    ENUM('dark','light') NOT NULL DEFAULT 'dark',
  -- ─── Role Promotion Ladder (migration 037) ─────────────────────────────────
  promotion_locked_until  DATETIME    DEFAULT NULL,         -- L4 lock window (24 jam default)
  promotion_failed_count  INT         NOT NULL DEFAULT 0,   -- counter attempt salah
  promotion_failed_at     DATETIME    DEFAULT NULL,         -- last failed attempt
  probationary_until      DATETIME    DEFAULT NULL,         -- 7 hari sejak role aktif
  probationary_from_role  VARCHAR(50) DEFAULT NULL,         -- role sebelum promotion (utk revoke rollback)
  created_at          DATETIME        NOT NULL DEFAULT NOW(),
  updated_at          DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  deleted_at          DATETIME        DEFAULT NULL,  -- SDL-L5 migration 028: soft-delete untuk retention/anonimisasi UU PDP Pasal 16
  CONSTRAINT chk_users_status CHECK (status IN ('AKTIF','NONAKTIF','MENUNGGU','DITOLAK','PENDING'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_username       ON users (username);
CREATE INDEX idx_users_email          ON users (email);
CREATE INDEX idx_users_role           ON users (role);
CREATE INDEX idx_users_status         ON users (status);
CREATE INDEX idx_users_username_lower ON users ((LOWER(username)));
CREATE INDEX idx_users_email_lower    ON users ((LOWER(email)));
CREATE INDEX idx_users_deleted_at     ON users (deleted_at);  -- migration 028 SDL-L5
CREATE INDEX idx_users_promotion_lock ON users (promotion_locked_until);  -- migration 037
CREATE INDEX idx_users_probation_until ON users (probationary_until);     -- migration 037

-- ─── SUPER ADMIN default (ganti password setelah setup) ──────────────────────
-- Password default: Admin@Prima2025
INSERT IGNORE INTO users (username, email, password_hash, nama_lengkap, role, status, email_verified)
VALUES (
  'superadmin',
  'admin@example.com',
  '$2b$12$JdkLIuK90kXrde1X3xTmGu05C.vJcOzJDRHuEcnYg6bLMltXjhUta',
  'Super Administrator',
  'SUPER_ADMIN',
  'AKTIF',
  1
);

-- ─── APP CONFIG ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  `key`      VARCHAR(100)  NOT NULL PRIMARY KEY,
  value      TEXT          NOT NULL DEFAULT (''),
  updated_at DATETIME      DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_config (`key`, value) VALUES
  ('app_status_usulan_aset',        'online'),
  ('app_status_blud',               'online'),
  ('app_status_perjanjian_kinerja', 'online'),
  ('app_status_probis',             'online'),
  ('app_status_rencana_aksi',       'online'),
  ('app_status_jp_renbang',         'online'),
  ('app_status_new_econtrolling',   'online'),
  ('app_status_kinerja',            'online'),
  ('app_status_rima_query',         'online');  -- kill-switch Q&A data Rima (fail-closed, G30)

-- ─── USULAN HEADERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usulan_headers (
  id                INT             NOT NULL AUTO_INCREMENT PRIMARY KEY,
  no_usulan         VARCHAR(30)     NOT NULL UNIQUE,
  tanggal           DATE            NOT NULL DEFAULT (CURRENT_DATE),
  pengusul          VARCHAR(100)    NOT NULL,
  sub_bidang        VARCHAR(50)     NOT NULL,
  jenis_belanja     TEXT            DEFAULT NULL,
  tahun_anggaran    VARCHAR(10)     DEFAULT '',
  jenis_usulan      ENUM('MURNI','PERUBAHAN','PERGESERAN') NOT NULL DEFAULT 'MURNI',
  jumlah_item       INT             NOT NULL DEFAULT 0,
  total_nilai       DECIMAL(18,2)   NOT NULL DEFAULT 0,
  total_nominal     DECIMAL(18,2)   NOT NULL DEFAULT 0,
  -- migration 015 (PERF-C4): persist agg untuk hindari correlated subquery di list
  jumlah_item_admin INT             NOT NULL DEFAULT 0,
  total_nilai_admin DECIMAL(18,2)   NOT NULL DEFAULT 0,
  status_ringkas    VARCHAR(30)     NOT NULL DEFAULT 'DRAFT',
  created_by        INT             DEFAULT NULL,
  created_at        DATETIME        NOT NULL DEFAULT NOW(),
  updated_at        DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_usulan_headers_sub_bidang  ON usulan_headers (sub_bidang);
CREATE INDEX idx_usulan_headers_status      ON usulan_headers (status_ringkas);
CREATE INDEX idx_usulan_headers_created_by  ON usulan_headers (created_by);
CREATE INDEX idx_usulan_headers_tanggal     ON usulan_headers (tanggal);
-- migration 014 (PERF-C5): indexes untuk filter/order yang sering di-hit
CREATE INDEX idx_uh_tahun_anggaran          ON usulan_headers (tahun_anggaran);
CREATE INDEX idx_uh_updated_at              ON usulan_headers (updated_at DESC);

-- ─── USULAN ITEMS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usulan_items (
  id                INT             NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usulan_id         INT             NOT NULL,
  no_usulan         VARCHAR(30)     NOT NULL,
  no_item           INT             NOT NULL,
  sub_bidang        VARCHAR(50)     NOT NULL,
  pengusul          VARCHAR(100)    NOT NULL,
  jenis_belanja     TEXT            DEFAULT NULL,
  nama_barang       VARCHAR(255)    NOT NULL,
  spesifikasi       TEXT            DEFAULT NULL,
  qty               INT             NOT NULL DEFAULT 1,
  satuan            VARCHAR(30)     NOT NULL DEFAULT 'unit',
  harga_est         DECIMAL(18,2)   NOT NULL DEFAULT 0,
  total_est         DECIMAL(18,2)   GENERATED ALWAYS AS (qty * harga_est) STORED,
  prioritas         VARCHAR(10)     NOT NULL DEFAULT 'SEDANG',
  status            VARCHAR(30)     NOT NULL DEFAULT 'DRAFT',
  file_url          TEXT            DEFAULT NULL,
  alasan            TEXT            DEFAULT (''),
  url_merk1         TEXT            DEFAULT (''),
  url_merk2         TEXT            DEFAULT (''),
  url_merk3         TEXT            DEFAULT (''),
  -- Review Bidang
  bidang_by         VARCHAR(100)    DEFAULT NULL,
  bidang_tgl        DATE            DEFAULT NULL,
  bidang_keputusan  VARCHAR(20)     DEFAULT NULL,
  bidang_catatan    TEXT            DEFAULT NULL,
  -- Review Admin
  admin_by          VARCHAR(100)    DEFAULT NULL,
  admin_tgl         DATE            DEFAULT NULL,
  admin_rekomendasi VARCHAR(20)     DEFAULT NULL,
  admin_catatan     TEXT            DEFAULT NULL,
  admin_qty         INT             DEFAULT NULL,
  admin_nominal     DECIMAL(18,2)   DEFAULT NULL,
  admin_harga       DECIMAL(18,2)   DEFAULT NULL,
  -- Review Kasubag
  kasubag_by        VARCHAR(100)    DEFAULT NULL,
  kasubag_tgl       DATE            DEFAULT NULL,
  kasubag_putusan   VARCHAR(20)     DEFAULT NULL,
  kasubag_catatan   TEXT            DEFAULT NULL,
  kasubag_nominal   DECIMAL(18,2)   DEFAULT NULL,         -- nominal verif Kasubag (snapshot, tak ditimpa Kabag)
  kasubag_qty       INT             DEFAULT NULL,         -- qty revisi Kasubag (untuk chain qty/harga)
  kasubag_harga     DECIMAL(18,2)   DEFAULT NULL,         -- harga revisi Kasubag
  -- Review Kabag
  kabag_by          VARCHAR(100)    DEFAULT NULL,
  kabag_tgl         DATE            DEFAULT NULL,
  kabag_putusan     VARCHAR(20)     DEFAULT NULL,
  kabag_catatan     TEXT            DEFAULT NULL,
  -- Nilai asli sebelum revisi langsung bidang
  nama_asal         VARCHAR(300)    DEFAULT NULL,
  spesifikasi_asal  TEXT            DEFAULT NULL,
  qty_asal          INT             DEFAULT NULL,
  harga_asal        DECIMAL(18,2)   DEFAULT NULL,
  -- Final
  qty_disetujui     INT             DEFAULT NULL,
  nominal_disetujui DECIMAL(18,2)   DEFAULT NULL,
  created_at        DATETIME        NOT NULL DEFAULT NOW(),
  updated_at        DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT chk_prioritas CHECK (prioritas IN ('TINGGI','SEDANG','RENDAH')),
  FOREIGN KEY (usulan_id) REFERENCES usulan_headers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_usulan_items_usulan_id  ON usulan_items (usulan_id);
CREATE INDEX idx_usulan_items_status     ON usulan_items (status);
CREATE INDEX idx_usulan_items_sub_bidang ON usulan_items (sub_bidang);
-- migration 014 (PERF-C5): composite untuk pattern WHERE usulan_id = ? AND status = ?
CREATE INDEX idx_ui_usulan_status        ON usulan_items (usulan_id, status);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         INT             NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recipient  VARCHAR(100)    NOT NULL,
  role       VARCHAR(50)     NOT NULL DEFAULT '',
  type       VARCHAR(50)     NOT NULL,
  pesan      TEXT            NOT NULL,
  no_usulan  VARCHAR(100)    DEFAULT NULL,
  sub_bidang VARCHAR(100)    DEFAULT NULL,
  dibaca     TINYINT(1)      NOT NULL DEFAULT 0,
  created_at DATETIME        NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notif_recipient ON notifications (recipient, dibaca);
CREATE INDEX idx_notif_created   ON notifications (created_at DESC);
-- migration 014 (PERF-C5): composite untuk fetch unread by recipient (covering index)
CREATE INDEX idx_notif_recipient_full ON notifications (recipient, dibaca, created_at DESC);

-- ─── AUDIT LOG ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT             DEFAULT NULL,
  username    VARCHAR(50)     DEFAULT NULL,
  event_type  VARCHAR(30)     NOT NULL,
  ip_address  VARCHAR(50)     DEFAULT NULL,
  user_agent  VARCHAR(250)    DEFAULT NULL,
  detail      TEXT            DEFAULT NULL,
  created_at  DATETIME        NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_event   ON audit_log (event_type);
CREATE INDEX idx_audit_log_user    ON audit_log (user_id);

-- ─── RIMA UNANSWERED (#2 fail-log mining) ─────────────────────────────────────
-- Pertanyaan Rima yang gagal dijawab classifier; bahan tumbuh KB. Teks di-redaksi
-- PII di klien + server (R4/G27). Migration: migration-rima-unanswered.sql.
CREATE TABLE IF NOT EXISTS rima_unanswered (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question    VARCHAR(200)    NOT NULL,
  page        VARCHAR(120)    NULL,
  user_id     INT             NULL,
  role        VARCHAR(40)     NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rima_unans_created (created_at),
  CONSTRAINT fk_rima_unans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Pertanyaan Rima tak terjawab — bahan tumbuh KB (#2 fail-log mining)';

-- ─── USER SESSIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id             BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id     VARCHAR(64)     NOT NULL UNIQUE,
  user_id        INT             NOT NULL,
  username       VARCHAR(50)     NOT NULL,
  role           VARCHAR(50)     DEFAULT NULL,
  ip_address     VARCHAR(50)     DEFAULT NULL,
  user_agent     VARCHAR(250)    DEFAULT NULL,
  created_at     DATETIME        NOT NULL DEFAULT NOW(),
  last_active    DATETIME        NOT NULL DEFAULT NOW(),
  invalidated_at DATETIME        DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_user_sessions_session_id ON user_sessions (session_id);
CREATE INDEX idx_user_sessions_user_id    ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_active     ON user_sessions (invalidated_at);
-- migration 014 (PERF-C5): ORDER BY last_active DESC di admin/sessions
CREATE INDEX idx_us_last_active           ON user_sessions (last_active DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- E-ANGGARAN
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── KINERJA MASTER REKENING ──────────────────────────────────────────────────
-- Catatan kolom sumber:
--   - tipe program/kegiatan/subkegiatan/sumber_anggaran → sumber = NULL (tidak dipakai)
--   - tipe uraian_ssk → sumber = NULL (sub-tab GAJI/BLUD/HARLEP/PROMKES/SARPRAS/
--     OBAT/PEMELIHARAAN/PEMBANGUNAN dihapus; uraian_ssk kini 1 halaman tanpa
--     pengelompokan sumber)
--   - tipe rekening (kinerja_rekening) → sumber tetap diisi sesuai enum
CREATE TABLE IF NOT EXISTS kinerja_master (
  id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun            VARCHAR(10)  NOT NULL DEFAULT '2025',
  tipe             ENUM('program','kegiatan','subkegiatan','uraian_ssk','sumber_anggaran') NOT NULL,
  sumber           ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN') DEFAULT NULL,
  nama             VARCHAR(255) NOT NULL,
  program_ref      VARCHAR(255) DEFAULT NULL COMMENT 'Referensi nama program (kegiatan/subkegiatan/uraian_ssk)',
  kegiatan_ref     VARCHAR(255) DEFAULT NULL COMMENT 'Referensi nama kegiatan (subkegiatan/uraian_ssk)',
  subkegiatan_ref  VARCHAR(255) DEFAULT NULL COMMENT 'Referensi nama sub kegiatan (uraian_ssk)',
  urut             INT          NOT NULL DEFAULT 0,
  created_by       INT          DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT NOW(),
  updated_at       DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_km_tahun_tipe   ON kinerja_master (tahun, tipe);
CREATE INDEX idx_km_sumber       ON kinerja_master (sumber);
CREATE INDEX idx_km_program_ref  ON kinerja_master (program_ref(100));
CREATE INDEX idx_km_kegiatan_ref ON kinerja_master (kegiatan_ref(100));

-- ─── KINERJA REKENING ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kinerja_rekening (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun           VARCHAR(10)  NOT NULL DEFAULT '2025',
  sumber          ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  uraian          VARCHAR(500) NOT NULL,
  uraian_ssk      VARCHAR(255) DEFAULT NULL,
  sumber_anggaran VARCHAR(100) DEFAULT NULL,
  program         VARCHAR(255) DEFAULT NULL,
  kegiatan        VARCHAR(255) DEFAULT NULL,
  subkegiatan     VARCHAR(255) DEFAULT NULL,
  urut            INT          NOT NULL DEFAULT 0,
  created_by      INT          DEFAULT NULL,
  updated_by      INT          DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT NOW(),
  updated_at      DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kr_tahun_sumber ON kinerja_rekening (tahun, sumber);

-- ─── KINERJA SSK (RKO — Target Fisik per Bulan) ──────────────────────────────
CREATE TABLE IF NOT EXISTS kinerja_ssk (
  id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun       VARCHAR(10)   NOT NULL DEFAULT '2025',
  sumber      ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  -- ─── Versi (migration-020) ───────────────────────────────────────────────
  versi_tipe       ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI',
  versi_seq        TINYINT     NOT NULL DEFAULT 0 COMMENT '0=MURNI, 1+=Perubahan ke-n',
  canonical_id     VARCHAR(20) NOT NULL DEFAULT '' COMMENT 'Identitas stabil cross-versi (mis. K-000123)',
  parent_versi_id  INT         NULL COMMENT 'FK self ke baris versi sebelumnya',
  locked_at        DATETIME    NULL COMMENT 'Versi terkunci setelah Perubahan berikutnya dibuat',
  is_nullified     BOOLEAN     NOT NULL DEFAULT FALSE COMMENT 'Nol-kan flag (alternatif hapus)',
  -- ─── Data SSK ────────────────────────────────────────────────────────────
  uraian_ssk  VARCHAR(255)  NOT NULL DEFAULT '',
  uraian      VARCHAR(500)  NOT NULL,
  program     VARCHAR(255)  DEFAULT NULL COMMENT 'Diisi otomatis dari Inject Rekening',
  kegiatan    VARCHAR(255)  DEFAULT NULL,
  subkegiatan VARCHAR(255)  DEFAULT NULL,
  pagu        DECIMAL(18,2) NOT NULL DEFAULT 0,
  months      JSON          DEFAULT NULL,
  months_pct  JSON          DEFAULT NULL,
  total       DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_pct   DECIMAL(7,2)  NOT NULL DEFAULT 0,
  urut        INT           NOT NULL DEFAULT 0,
  updated_by  INT           DEFAULT NULL,
  updated_at  DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_versi_id) REFERENCES kinerja_ssk(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ks_tahun_sumber ON kinerja_ssk (tahun, sumber);
CREATE INDEX idx_ks_versi        ON kinerja_ssk (tahun, sumber, versi_tipe, versi_seq);
CREATE INDEX idx_ks_canonical    ON kinerja_ssk (canonical_id);

-- ─── KINERJA REALISASI NOMENKLATUR ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kinerja_realisasi_nomen (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun      VARCHAR(10)  NOT NULL DEFAULT '2025',
  sumber     ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  urut       INT          NOT NULL DEFAULT 0,
  keterangan VARCHAR(500) NOT NULL DEFAULT '',
  updated_by INT          DEFAULT NULL,
  updated_at DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_krn_tahun_sumber ON kinerja_realisasi_nomen (tahun, sumber);

-- ─── KINERJA REALISASI ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kinerja_realisasi (
  id                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun             VARCHAR(10)   NOT NULL DEFAULT '2025',
  sumber            ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  bulan             TINYINT       NOT NULL COMMENT '1=Jan, 12=Des',
  -- ─── Pointer SSK versi (migration-021) ───────────────────────────────────
  ssk_canonical_id  VARCHAR(20)   NOT NULL DEFAULT '' COMMENT 'Link ke kinerja_ssk.canonical_id (cross-versi)',
  ssk_versi_tipe    ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI' COMMENT 'Versi SSK yang dijadikan acuan',
  ssk_versi_seq     TINYINT       NOT NULL DEFAULT 0,
  -- ─── Label denormalisasi (untuk display tanpa JOIN) ──────────────────────
  keterangan        VARCHAR(500)  NOT NULL DEFAULT '',
  program           VARCHAR(255)  DEFAULT NULL COMMENT 'Diisi otomatis dari Init SSK',
  kegiatan          VARCHAR(255)  DEFAULT NULL,
  subkegiatan       VARCHAR(255)  DEFAULT NULL,
  uraian_ssk        VARCHAR(255)  DEFAULT NULL,
  -- ─── Input user (PERSISTEN, tidak hilang saat switch versi) ──────────────
  -- Checkpoint D (migration-031): kolom turunan pagu_awal/target_fisik/pct_*/
  -- akum_*/deviasi_* sudah di-DROP. Semua diturunkan server-side dari
  -- real_fisik + real_keuangan + SSK lookup (canonical_id) via
  -- lib/data/kinerja-calc.ts → recalcAllRealisasiServer.
  real_fisik        DECIMAL(18,2) NOT NULL DEFAULT 0,
  real_keuangan     DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_by        INT           DEFAULT NULL,
  updated_at        DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kr_tahun_sumber       ON kinerja_realisasi (tahun, sumber);
CREATE INDEX idx_kr_tahun_sumber_bulan ON kinerja_realisasi (tahun, sumber, bulan);
CREATE INDEX idx_kr_canonical          ON kinerja_realisasi (ssk_canonical_id);
CREATE INDEX idx_kr_versi              ON kinerja_realisasi (tahun, sumber, ssk_versi_tipe, ssk_versi_seq);

-- ─── KINERJA PENDAPATAN CRR ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kinerja_pendapatan_crr (
  id                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun             VARCHAR(10)   NOT NULL DEFAULT '2025',
  bulan_ke          TINYINT       NOT NULL COMMENT '1-12',
  bulan             VARCHAR(20)   NOT NULL DEFAULT '',
  pendapatan        DECIMAL(18,2) NOT NULL DEFAULT 0,
  belanja_blud      DECIMAL(18,2) NOT NULL DEFAULT 0,
  belanja_daerah    DECIMAL(18,2) NOT NULL DEFAULT 0,
  pendapatan_sd     DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 's/d bulan ini',
  belanja_blud_sd   DECIMAL(18,2) NOT NULL DEFAULT 0,
  belanja_daerah_sd DECIMAL(18,2) NOT NULL DEFAULT 0,
  crr_parsial_pct   DECIMAL(7,2)  NOT NULL DEFAULT 0,
  crr_total_pct     DECIMAL(7,2)  NOT NULL DEFAULT 0,
  updated_by        INT           DEFAULT NULL,
  updated_at        DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_crr_tahun_bulan (tahun, bulan_ke)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kpc_tahun ON kinerja_pendapatan_crr (tahun);

-- ─── KINERJA PENDAPATAN REALISASI ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kinerja_pendapatan_real (
  id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun       VARCHAR(10)   NOT NULL DEFAULT '2025',
  urut        INT           NOT NULL DEFAULT 0,
  keterangan  VARCHAR(500)  NOT NULL DEFAULT '',
  target      DECIMAL(18,2) NOT NULL DEFAULT 0,
  realisasi   DECIMAL(18,2) NOT NULL DEFAULT 0,
  capaian_pct DECIMAL(7,2)  NOT NULL DEFAULT 0,
  updated_by  INT           DEFAULT NULL,
  updated_at  DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_kpr_tahun ON kinerja_pendapatan_real (tahun);

-- ─── KINERJA REALISASI MAP (IK-4 — peta keterangan Excel → SSK, impor belanja) ──
CREATE TABLE IF NOT EXISTS kinerja_realisasi_map (
  id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun            VARCHAR(10)  NOT NULL,
  sumber           ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS','OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  keterangan_excel VARCHAR(500) NOT NULL COMMENT 'Uraian dari file Excel (mentah)',
  ssk_canonical_id VARCHAR(20)  NOT NULL COMMENT 'Target SSK (kinerja_realisasi.ssk_canonical_id)',
  updated_by       INT          DEFAULT NULL,
  updated_at       DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY uq_krm_tahun_ket (tahun, keterangan_excel),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_krm_tahun ON kinerja_realisasi_map (tahun);

-- ─── BLUD — DPA & PERGESERAN ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dpa_blud (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  versi_tanggal    DATE          NOT NULL COMMENT 'Tanggal versi/history DPA',
  is_latest        TINYINT       NOT NULL DEFAULT 1,
  kode_rekening    VARCHAR(64)   NOT NULL DEFAULT '',
  uraian           TEXT          NOT NULL,
  vol              DECIMAL(18,4)     NULL,
  satuan           VARCHAR(32)       NULL,
  harga            DECIMAL(18,2)     NULL,
  jumlah           DECIMAL(18,2) NOT NULL DEFAULT 0,
  penanggung_jawab VARCHAR(128)      NULL,
  keterangan       TEXT              NULL,
  tipe_baris       ENUM('GRANDMASTER','MASTER','CHILD','LEADER','MEMBER','PLETON-LEADER','PLETON-MEMBER','KETUA-KELOMPOK-A','ANGGOTA-KELOMPOK-A','KETUA-KELOMPOK-B','ANGGOTA-KELOMPOK-B','L7-HEAD','L7-SUB','L8-HEAD','L8-SUB') NOT NULL DEFAULT 'CHILD',
  row_id           VARCHAR(64)       NULL COMMENT 'UUID baris, unik per versi',
  parent_id        VARCHAR(64)       NULL COMMENT 'row_id parent',
  urutan           INT UNSIGNED  NOT NULL DEFAULT 0,
  origin           ENUM('MANUAL','USULAN') NOT NULL DEFAULT 'MANUAL' COMMENT 'Asal baris: input manual atau import usulan',
  usulan_item_id   INT               NULL COMMENT 'FK soft ke usulan_items.id (jejak import, non-unique: versioned)',
  usulan_no        VARCHAR(64)       NULL COMMENT 'No usulan asal (display/trace)',
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_versi_latest (versi_tanggal, is_latest),
  INDEX idx_row_id       (row_id),
  INDEX idx_parent_id    (parent_id),
  INDEX idx_urutan       (versi_tanggal, urutan),
  INDEX idx_dpa_usulan_item (usulan_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DPA BLUD - rencana anggaran';

CREATE TABLE IF NOT EXISTS pergeseran_dpa (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  versi_tanggal       DATE          NOT NULL COMMENT 'Tanggal versi pergeseran',
  dpa_versi_tanggal   DATE          NOT NULL COMMENT 'Versi DPA yang menjadi acuan',
  is_latest           TINYINT(1)    NOT NULL DEFAULT 1,
  kode_rekening       VARCHAR(64)   NOT NULL DEFAULT '',
  uraian              TEXT          NOT NULL,
  vol                 DECIMAL(18,4)     NULL,
  satuan              VARCHAR(32)       NULL,
  harga               DECIMAL(18,2)     NULL,
  jumlah              DECIMAL(18,2) NOT NULL DEFAULT 0,
  vol_p               DECIMAL(18,4)     NULL COMMENT 'Volume pergeseran',
  harga_p             DECIMAL(18,2)     NULL COMMENT 'Harga pergeseran',
  pergeseran          DECIMAL(18,2) NOT NULL DEFAULT 0,
  bertambah_berkurang DECIMAL(18,2) NOT NULL DEFAULT 0,
  tipe_baris          ENUM('GRANDMASTER','MASTER','CHILD','LEADER','MEMBER','PLETON-LEADER','PLETON-MEMBER','KETUA-KELOMPOK-A','ANGGOTA-KELOMPOK-A','KETUA-KELOMPOK-B','ANGGOTA-KELOMPOK-B','L7-HEAD','L7-SUB','L8-HEAD','L8-SUB') NOT NULL DEFAULT 'CHILD',
  row_id              VARCHAR(64)       NULL,
  parent_id           VARCHAR(64)       NULL,
  urutan              INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_versi_latest (versi_tanggal, is_latest),
  INDEX idx_dpa_versi    (dpa_versi_tanggal),
  INDEX idx_row_id       (row_id),
  INDEX idx_parent_id    (parent_id),
  INDEX idx_urutan       (versi_tanggal, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pergeseran DPA - perubahan anggaran';

CREATE OR REPLACE VIEW v_dpa_history AS
  SELECT versi_tanggal, COUNT(*) AS jumlah_baris
  FROM dpa_blud GROUP BY versi_tanggal ORDER BY versi_tanggal DESC;

CREATE OR REPLACE VIEW v_pergeseran_history AS
  SELECT versi_tanggal, dpa_versi_tanggal, COUNT(*) AS jumlah_baris
  FROM pergeseran_dpa GROUP BY versi_tanggal, dpa_versi_tanggal ORDER BY versi_tanggal DESC;

-- ─── BLUD — MASTER AKUN ──────────────────────────────────────────────────────
-- Tabel master daftar kode rekening + uraian. Dipakai sebagai source-of-truth
-- dropdown rekening di DPA & Pergeseran. Migration 018.

CREATE TABLE IF NOT EXISTS master_akun (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kode        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT 'Kode rekening, e.g. "510199"',
  uraian      VARCHAR(255)  NOT NULL            COMMENT 'Nama akun, e.g. "Belanja Pegawai BLUD"',
  urutan      INT UNSIGNED  NOT NULL DEFAULT 0  COMMENT 'Urutan tampil di UI',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kode   (kode),
  INDEX idx_uraian (uraian(64)),
  INDEX idx_urutan (urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BLUD - Master daftar kode rekening';

-- ─── BLUD — KODE BESAR ───────────────────────────────────────────────────────
-- Tabel daftar kode rekening "besar" (high-level category) untuk modul BLUD.
-- Berbeda dengan master_akun (detail per kode rekening), kode_besar berisi
-- kategori belanja level tinggi (e.g. "5.X", "5.1", "5.1.1"). Migration 025.

CREATE TABLE IF NOT EXISTS penanggung_jawab (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(255)  NOT NULL,
  urutan      INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_label (label),
  INDEX idx_urutan (urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BLUD - Master daftar Penanggung Jawab';

CREATE TABLE IF NOT EXISTS kode_besar (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kode        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT 'Kode rekening besar, e.g. "5.X" / "5.1" / "5.1.1"',
  uraian      VARCHAR(255)  NOT NULL            COMMENT 'Uraian, e.g. "Belanja Daerah"',
  level       VARCHAR(8)    NOT NULL DEFAULT 'L2' COMMENT 'L1 | L2 | L2.1 — tipe_baris saat inject ke DPA (migration 026)',
  parent_kode VARCHAR(64)       NULL              COMMENT 'Ref ke kode_besar.kode — wajib utk L2.1, NULL utk L1, auto utk L2 (migration 026)',
  urutan      INT UNSIGNED  NOT NULL DEFAULT 0  COMMENT 'Urutan tampil di UI',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kode (kode),
  INDEX idx_uraian (uraian(64)),
  INDEX idx_urutan (urutan),
  INDEX idx_parent_kode (parent_kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BLUD - Daftar Kode Besar (template awal DPA)';

-- ─── BLUD — REKAP PENANGGUNG JAWAB ───────────────────────────────────────────
-- Snapshot rekap PJ — output dari menu Cetak BLUD. Pattern replace-latest:
-- DELETE old snapshot per versi_dpa + bulkInsert new rows, dibungkus
-- withTransaction supaya atomic. Migration 024.

CREATE TABLE IF NOT EXISTS rekap_pk (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  versi_dpa    DATE           NOT NULL                COMMENT 'Versi DPA yang di-rekap',
  label        VARCHAR(255)   NOT NULL                COMMENT 'Nama PJ atau label total (e.g. "TOTAL BELANJA BLUD")',
  nominal      DECIMAL(18,2)  NOT NULL DEFAULT 0      COMMENT 'Total nominal per PJ',
  saved_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu snapshot disimpan',
  saved_by     INT                NULL               COMMENT 'User id yang menyimpan; SET NULL kalau user dihapus (match users.id signed INT)',
  INDEX idx_versi    (versi_dpa),
  INDEX idx_saved_at (saved_at),
  CONSTRAINT fk_rekap_pk_user FOREIGN KEY (saved_by)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Snapshot rekap Penanggung Jawab';

-- BLUD optimistic locking (Migration 036) — cegah lost update concurrent edit
-- Generic 1-tabel cover semua entity BLUD yg pakai whole-version DELETE+INSERT.
CREATE TABLE IF NOT EXISTS blud_locks (
  entity        VARCHAR(50)  NOT NULL,
  key_id        VARCHAR(100) NOT NULL,
  version       INT          NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by    INT          NULL,
  PRIMARY KEY (entity, key_id),
  INDEX idx_entity (entity),
  CONSTRAINT fk_blud_locks_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Optimistic version lock per entity+key (cegah R1 lost update)';

-- ═══════════════════════════════════════════════════════════════════════════
-- Rencana Aksi (modul baru — Migration 032)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rencana_aksi (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun           SMALLINT UNSIGNED NOT NULL,
  level           ENUM('tujuan','sasaran','program','kegiatan','sub-kegiatan') NOT NULL,
  program         VARCHAR(255) NOT NULL,
  kegiatan        VARCHAR(255) NULL,
  sub_kegiatan    VARCHAR(255) NULL,
  indikator       VARCHAR(500) NOT NULL,
  jenis           ENUM('Akumulatif','Progres Positif','Progres Negatif','Pengulangan') NOT NULL DEFAULT 'Akumulatif',
  sasaran               VARCHAR(255) NULL,
  tujuan                VARCHAR(255) NULL COMMENT 'Parent reference untuk level=sasaran -> menunjuk nama Tujuan induk (Migration 042)',
  outcome_program       VARCHAR(500) NULL,
  outcome_kegiatan      VARCHAR(500) NULL,
  outcome_sub_kegiatan  VARCHAR(500) NULL,
  version         INT NOT NULL DEFAULT 0,
  satuan          VARCHAR(50)  NOT NULL DEFAULT 'Persen',
  target_rpjmd    INT          NOT NULL DEFAULT 0,
  target_tahunan  INT          NOT NULL DEFAULT 0,
  q1_target       INT          NOT NULL DEFAULT 0,
  q1_realisasi    INT          NOT NULL DEFAULT 0,
  q2_target       INT          NOT NULL DEFAULT 0,
  q2_realisasi    INT          NOT NULL DEFAULT 0,
  q3_target       INT          NOT NULL DEFAULT 0,
  q3_realisasi    INT          NOT NULL DEFAULT 0,
  q4_target       INT          NOT NULL DEFAULT 0,
  q4_realisasi    INT          NOT NULL DEFAULT 0,
  anggaran_nominal BIGINT      NULL DEFAULT NULL COMMENT 'Pagu anggaran (Rp) — hanya untuk level sub-kegiatan (Migration 040)',
  bulan_target    JSON         NULL DEFAULT NULL COMMENT '12 target bulanan (sub-kegiatan) — sumber derive q1-q4 target (Migration 041)',
  bulan_realisasi JSON         NULL DEFAULT NULL COMMENT '12 realisasi bulanan (sub-kegiatan) — reserved Realisasi menu (Migration 041)',
  created_by      INT          NULL,
  updated_by      INT          NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tahun_level_ind (tahun, level, indikator),
  INDEX idx_tahun_level (tahun, level),
  INDEX idx_tahun_level_prog (tahun, level, program),
  CONSTRAINT fk_ra_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ra_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rencana Aksi - target & realisasi triwulan per indikator';

-- ═══════════════════════════════════════════════════════════════════════════
-- Role Promotion Ladder (modul baru — Migration 037)
-- Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md
-- ═══════════════════════════════════════════════════════════════════════════

-- Generic kv settings (bootstrap flag, future toggles).
CREATE TABLE IF NOT EXISTS system_settings (
  `key`      VARCHAR(100)  NOT NULL PRIMARY KEY,
  `val`      TEXT          NULL,
  updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Generic system settings (kv); bootstrap flag dst';

INSERT IGNORE INTO system_settings (`key`, `val`)
VALUES ('bootstrap_super_admin_used_at', NULL);

-- Recovery flag: NULL=belum pernah, datetime=sudah pernah dipakai (single-use).
-- Dipakai scripts/promotion-recovery.js — break-glass all-SA-locked emergency.
INSERT IGNORE INTO system_settings (`key`, `val`)
VALUES ('recovery_used_at', NULL);

-- Lifecycle: PENDING → COOLDOWN → COMPLETED (atau REJECTED / EXPIRED / CANCELLED).
-- FK user_id + approved_by → users.id (signed INT, match `rekap_pk.saved_by` pattern).
CREATE TABLE IF NOT EXISTS role_promotion_requests (
  id              INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id         INT            NOT NULL,
  from_role       VARCHAR(50)    NOT NULL,
  to_role         VARCHAR(50)    NOT NULL,
  reason          VARCHAR(1000)  NOT NULL DEFAULT '',
  status          ENUM('PENDING','COOLDOWN','COMPLETED','REJECTED','EXPIRED','CANCELLED')
                                 NOT NULL DEFAULT 'PENDING',
  approved_by     INT            NULL,
  approved_at     DATETIME       NULL,
  cooldown_until  DATETIME       NULL,
  completed_at    DATETIME       NULL,
  rejected_reason VARCHAR(500)   NULL,
  is_bootstrap    TINYINT(1)     NOT NULL DEFAULT 0,
  ip_address      VARCHAR(45)    NULL,
  user_agent      VARCHAR(250)   NULL,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prr_user_status     (user_id, status),
  INDEX idx_prr_status_cooldown (status, cooldown_until),
  INDEX idx_prr_status_created  (status, created_at),
  CONSTRAINT fk_prr_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_prr_approver
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Role promotion requests — multi-layer security ladder';

-- ═══════════════════════════════════════════════════════════════════════════
-- Email Log (Migration 038)
-- Konsep: docs/session/EMAIL_NOTIF_CONCEPT.md
-- Replaces app_config row counter `email_sent_*` (lebih akurat + audit trail).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_log (
  id          BIGINT       AUTO_INCREMENT PRIMARY KEY,
  sent_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recipient   VARCHAR(255) NOT NULL,
  subject     VARCHAR(500) NOT NULL,
  event_type  VARCHAR(64)  NOT NULL,
  status      ENUM('SENT','FAILED','SKIPPED_TOGGLE','SKIPPED_NO_CREDS') NOT NULL,
  error_msg   TEXT         NULL,
  INDEX idx_email_log_sent_at    (sent_at),
  INDEX idx_email_log_event_type (event_type),
  INDEX idx_email_log_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Email audit trail per kirim — replaces app_config row counter';

-- Toggle Promotion events (migration 038) — appended ke seed app_config existing
INSERT IGNORE INTO app_config (`key`, value) VALUES
  ('email_notif_promotion_new_request', 'true'),
  ('email_notif_promotion_approved',    'true'),
  ('email_notif_promotion_rejected',    'true'),
  ('email_notif_promotion_bootstrap',   'true');

-- ═══════════════════════════════════════════════════════════════════════════
-- Buku Besar Aset (BBA) — modul baru (migration-inventaris-modal.sql + migration-rename-buku-besar-aset.sql)
-- Register belanja modal lintas-tahun + lifecycle status. canonical_id stabil
-- lintas-tahun (UNIQUE per (canonical_id, tahun_anggaran)); version = optimistic
-- lock per-row (L48 CAS). Konsep: docs/session/buku-besar-aset/CONCEPT.md.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS buku_besar_aset (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  canonical_id      VARCHAR(20)     NOT NULL DEFAULT '',
  tahun_anggaran    SMALLINT        NOT NULL,
  -- migration-bba-import-usulan: provenance asal-usulan (origin USULAN)
  origin            ENUM('MANUAL','USULAN') NOT NULL DEFAULT 'MANUAL',
  usulan_item_id    INT             NULL,
  usulan_no         VARCHAR(30)     NULL,
  usulan_keputusan  ENUM('DISETUJUI','DITOLAK') NULL,
  ditolak_oleh      ENUM('ADMIN','KASUBAG','KABAG') NULL,
  sub_bidang        VARCHAR(50)     NULL,
  kode_rekening     VARCHAR(64)     NULL,
  uraian            TEXT            NOT NULL,
  kategori_aset     VARCHAR(64)     NULL,
  sumber_anggaran   ENUM('BLUD','APBD','DAK','LAINNYA') NOT NULL DEFAULT 'BLUD',
  vol               DECIMAL(18,2)   NOT NULL DEFAULT 0,
  satuan            VARCHAR(32)     NULL,
  harga             DECIMAL(18,2)   NOT NULL DEFAULT 0,
  nilai_rencana     DECIMAL(18,2)   NOT NULL DEFAULT 0,
  status            ENUM('DIRENCANAKAN','REALISASI_PENUH','REALISASI_SEBAGIAN','TIDAK_TEREALISASI')
                    NOT NULL DEFAULT 'DIRENCANAKAN',
  nilai_realisasi   DECIMAL(18,2)   NOT NULL DEFAULT 0,
  vol_realisasi     DECIMAL(18,2)   NOT NULL DEFAULT 0,
  tgl_realisasi     DATE            NULL,
  penanggung_jawab  VARCHAR(128)    NULL,
  dpa_row_id        VARCHAR(64)     NULL,
  dpa_versi_tanggal DATE            NULL,
  keterangan        TEXT            NULL,
  version           INT             NOT NULL DEFAULT 0,
  created_by        INT             NULL,
  updated_by        INT             NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_im_canonical_tahun (canonical_id, tahun_anggaran),
  UNIQUE KEY uq_bba_usulan_item (usulan_item_id),
  KEY idx_im_tahun        (tahun_anggaran),
  KEY idx_im_canonical    (canonical_id),
  KEY idx_im_status       (status),
  KEY idx_im_tahun_status (tahun_anggaran, status),
  CONSTRAINT fk_im_created FOREIGN KEY (created_by)     REFERENCES users(id)            ON DELETE SET NULL,
  CONSTRAINT fk_im_updated FOREIGN KEY (updated_by)     REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Buku Besar Aset (BBA) — register belanja modal lintas-tahun + lifecycle status';

INSERT IGNORE INTO app_config (`key`, value) VALUES ('app_status_buku_besar_aset', 'online');

-- Master Kategori Aset (BBA) — sumber dropdown kategori_aset (migration-bba-kategori-master.sql)
CREATE TABLE IF NOT EXISTS bba_kategori_aset (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama       VARCHAR(128) NOT NULL,
  urutan     INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bba_kategori_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Master kategori aset (BBA) — sumber dropdown kategori_aset';

INSERT IGNORE INTO bba_kategori_aset (nama, urutan) VALUES
  ('TANAH', 1),
  ('PERALATAN DAN MESIN', 2),
  ('GEDUNG DAN BANGUNAN', 3),
  ('JALAN, IRIGASI, DAN JARINGAN', 4),
  ('KONSTRUKSI DALAM PENGERJAAN (KDP)', 5),
  ('ALKES & ALDOK', 6);

-- ═══════════════════════════════════════════════════════════════════════════
-- LKJIP Builder — modul baru (migration-lkjip.sql)
-- Penyusun dokumen LKJIP/SAKIP tahunan berbasis outline-tree + blok.
-- canonical_id stabil lintas-tahun; version = optimistic lock dokumen-level (L48 CAS).
-- Nomor section DIHITUNG (tidak disimpan). Konsep: docs/session/lkjip/CONCEPT.md.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lkjip_dokumen (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  canonical_id  VARCHAR(20)     NOT NULL DEFAULT '',
  tahun         SMALLINT        NOT NULL,
  judul         VARCHAR(255)    NOT NULL,
  jenis         ENUM('LKJIP')   NOT NULL DEFAULT 'LKJIP',
  status        ENUM('DRAFT','FINAL') NOT NULL DEFAULT 'DRAFT',
  nomor_config  JSON            NULL,
  style_config  JSON            NULL,
  version       INT             NOT NULL DEFAULT 0,
  finalized_at  DATETIME        NULL,
  created_by    INT             NULL,
  updated_by    INT             NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lkjip_canonical (canonical_id),
  KEY idx_lkjip_tahun  (tahun),
  KEY idx_lkjip_status (status),
  CONSTRAINT fk_lkjip_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lkjip_updated FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — header dokumen laporan kinerja tahunan';

CREATE TABLE IF NOT EXISTS lkjip_section (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dokumen_id  BIGINT UNSIGNED NOT NULL,
  parent_id   BIGINT UNSIGNED NULL,
  depth       TINYINT         NOT NULL DEFAULT 0,
  urutan      INT             NOT NULL DEFAULT 0,
  judul       VARCHAR(255)    NOT NULL,
  locked      TINYINT         NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lks_dok_parent (dokumen_id, parent_id, urutan),
  KEY idx_lks_dok_depth  (dokumen_id, depth),
  CONSTRAINT fk_lks_dokumen FOREIGN KEY (dokumen_id) REFERENCES lkjip_dokumen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — node pohon kerangka (adjacency list). Nomor dihitung, tidak disimpan';

CREATE TABLE IF NOT EXISTS lkjip_block (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id  BIGINT UNSIGNED NOT NULL,
  urutan      INT             NOT NULL DEFAULT 0,
  tipe        ENUM('NARASI','TABEL','GAMBAR','GRAFIK') NOT NULL,
  payload     JSON            NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lkb_section (section_id, urutan),
  CONSTRAINT fk_lkb_section FOREIGN KEY (section_id) REFERENCES lkjip_section(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — blok isi tiap section (NARASI/TABEL/GAMBAR)';

INSERT IGNORE INTO app_config (`key`, value) VALUES ('app_status_lkjip', 'online');

-- LKJIP versi/riwayat (migration-lkjip-versi.sql) — snapshot JSON utk pulihkan + drive_file_id arsip docx
CREATE TABLE IF NOT EXISTS lkjip_versi (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dokumen_id    BIGINT UNSIGNED NOT NULL,
  versi_no      INT             NOT NULL,
  label         VARCHAR(255)    NULL,
  snapshot      JSON            NOT NULL,
  drive_file_id VARCHAR(64)     NULL,
  drive_name    VARCHAR(255)    NULL,
  created_by    INT             NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lkv_dok (dokumen_id, versi_no),
  CONSTRAINT fk_lkv_dokumen FOREIGN KEY (dokumen_id) REFERENCES lkjip_dokumen(id) ON DELETE CASCADE,
  CONSTRAINT fk_lkv_user    FOREIGN KEY (created_by) REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — snapshot versi dokumen (riwayat + pulihkan/edit-ulang)';

-- ─── uploaded_files (L61): ownership file Drive utk authorize /api/upload/download ───
CREATE TABLE IF NOT EXISTS uploaded_files (
  file_id      VARCHAR(64)  NOT NULL,
  uploaded_by  INT          NULL,
  context      VARCHAR(40)  NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (file_id),
  CONSTRAINT fk_uploaded_files_user FOREIGN KEY (uploaded_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Ownership file Drive untuk authorize /api/upload/download (L61)';
CREATE INDEX idx_uploaded_files_user ON uploaded_files (uploaded_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- Perjanjian Kinerja (PK) — modul (migration-029-pk-tables.sql)
-- 8 tabel: pk_sasaran, pk_program, pk_unit_kerja, pk_unit_kerja_blud_pj,
--          pk_pejabat, pk_dokumen, pk_dokumen_lampiran, pk_dokumen_anggaran.
-- Pihak Pertama = BAWAHAN · Pihak Kedua = ATASAN. Konsep: docs/session/PK_REFACTOR_CONCEPT.md
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── pk_sasaran (Master Sasaran — referensi indikator + target) ───────────────
CREATE TABLE IF NOT EXISTS pk_sasaran (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  program                  VARCHAR(255) NOT NULL,
  indikator_program        VARCHAR(500),
  target_program           VARCHAR(255),
  kegiatan                 VARCHAR(255),
  indikator_kegiatan       VARCHAR(500),
  target_kegiatan          VARCHAR(255),
  subkegiatan              VARCHAR(255),
  indikator_subkegiatan    VARCHAR(500),
  target_subkegiatan       VARCHAR(255),
  tahun                    VARCHAR(4) NOT NULL,
  created_at               DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by               INT,
  updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pk_sasaran_tahun (tahun),
  INDEX idx_pk_sasaran_program (program(100), kegiatan(50), subkegiatan(50)),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── pk_program (Master Program — hierarki program/kegiatan/sub) ──────────────
-- UNIQUE pakai prefix index: utf8mb4 4 byte/char, VARCHAR full > 3072 byte InnoDB.
CREATE TABLE IF NOT EXISTS pk_program (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  program      VARCHAR(255) NOT NULL,
  kegiatan     VARCHAR(255),
  subkegiatan  VARCHAR(255),
  tahun        VARCHAR(4) NOT NULL,
  level        ENUM('program','kegiatan','subkegiatan') NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by   INT,
  UNIQUE KEY uk_pk_program (tahun, program(150), kegiatan(150), subkegiatan(150)),
  INDEX idx_pk_program_tahun_level (tahun, level),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── pk_unit_kerja (struktur organisasi + atasan_default) ─────────────────────
-- nama_unit HARUS exact match penanggung_jawab.label (migration 027) utk BLUD lookup.
CREATE TABLE IF NOT EXISTS pk_unit_kerja (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  nama_unit             VARCHAR(255) UNIQUE NOT NULL,
  level                 ENUM('program','kegiatan','subkegiatan') NOT NULL,
  atasan_default        VARCHAR(255),
  selectable_as_pertama BOOLEAN DEFAULT TRUE,
  urutan                INT DEFAULT 0,
  active                BOOLEAN DEFAULT TRUE,
  INDEX idx_pk_unit_active (active, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO pk_unit_kerja (nama_unit, level, atasan_default, selectable_as_pertama, urutan) VALUES
  ('Direktur',                                     'program', NULL,                     FALSE, 1),
  ('Wadir Pelayanan',                              'program', 'Direktur',               TRUE,  2),
  ('Wadir Umum dan Keuangan',                      'program', 'Direktur',               TRUE,  3),
  ('Kabid Pelayanan',                              'kegiatan','Wadir Pelayanan',        TRUE, 10),
  ('Kabid Keperawatan',                            'kegiatan','Wadir Pelayanan',        TRUE, 11),
  ('Kabag Umum',                                   'kegiatan','Wadir Umum dan Keuangan',TRUE, 20),
  ('Kabag Keuangan',                               'kegiatan','Wadir Umum dan Keuangan',TRUE, 21),
  ('Kabag Perencanaan',                            'kegiatan','Wadir Umum dan Keuangan',TRUE, 22),
  ('Kasi Penunjang Medis',                         'subkegiatan','Kabid Pelayanan',     TRUE,100),
  ('Kasi Penunjang Non Medis',                     'subkegiatan','Kabid Pelayanan',     TRUE,101),
  ('Kasubbag Perbendaharaan',                      'subkegiatan','Kabag Keuangan',      TRUE,110),
  ('Kasubbag Akuntansi',                           'subkegiatan','Kabag Keuangan',      TRUE,111),
  ('Kasubbag Pengembangan Pendapatan',             'subkegiatan','Kabag Keuangan',      TRUE,112),
  ('Kasubbag Rumah Tangga',                        'subkegiatan','Kabag Umum',          TRUE,120),
  ('Kasubbag TU, Hukum & Humas',                   'subkegiatan','Kabag Umum',          TRUE,121),
  ('Kasubbag Organisasi & Kepegawaian',            'subkegiatan','Kabag Umum',          TRUE,122),
  ('Kasubag Program',                              'subkegiatan','Kabag Perencanaan',   TRUE,130),
  ('Kasubbag Pendidikan & Pengembangan',           'subkegiatan','Kabag Perencanaan',   TRUE,131),
  ('Kasubbag Manajemen Data & Sistem Informasi',   'subkegiatan','Kabag Perencanaan',   TRUE,132);

-- ─── pk_unit_kerja_blud_pj (mapping aggregate BLUD lookup) ────────────────────
CREATE TABLE IF NOT EXISTS pk_unit_kerja_blud_pj (
  unit_pk       VARCHAR(255) NOT NULL,
  blud_pj_label VARCHAR(255) NOT NULL,
  PRIMARY KEY (unit_pk, blud_pj_label),
  FOREIGN KEY (unit_pk) REFERENCES pk_unit_kerja(nama_unit) ON UPDATE CASCADE ON DELETE CASCADE,
  INDEX idx_pk_blud_pj_unit (unit_pk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO pk_unit_kerja_blud_pj (unit_pk, blud_pj_label) VALUES
  ('Wadir Pelayanan',         'Kasi Penunjang Medis'),
  ('Wadir Pelayanan',         'Kasi Penunjang Non Medis'),
  ('Wadir Pelayanan',         'Kabid Pelayanan'),
  ('Wadir Pelayanan',         'Kabid Keperawatan'),
  ('Wadir Umum dan Keuangan', 'Kasubbag Perbendaharaan'),
  ('Wadir Umum dan Keuangan', 'Kasubbag Akuntansi'),
  ('Wadir Umum dan Keuangan', 'Kasubbag Pengembangan Pendapatan'),
  ('Wadir Umum dan Keuangan', 'Kasubbag Rumah Tangga'),
  ('Wadir Umum dan Keuangan', 'Kasubbag TU, Hukum & Humas'),
  ('Wadir Umum dan Keuangan', 'Kasubbag Organisasi & Kepegawaian'),
  ('Wadir Umum dan Keuangan', 'Kasubag Program'),
  ('Wadir Umum dan Keuangan', 'Kasubbag Pendidikan & Pengembangan'),
  ('Wadir Umum dan Keuangan', 'Kasubbag Manajemen Data & Sistem Informasi'),
  ('Kabid Pelayanan',         'Kasi Penunjang Medis'),
  ('Kabid Pelayanan',         'Kasi Penunjang Non Medis');

-- ─── pk_pejabat (referensi nama/jabatan/pangkat/NIP per unit per tahun) ───────
CREATE TABLE IF NOT EXISTS pk_pejabat (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  unit_kerja  VARCHAR(255) NOT NULL,
  nama        VARCHAR(255) NOT NULL,
  jabatan     VARCHAR(255) NOT NULL,
  pangkat     VARCHAR(100),
  nip         VARCHAR(50),
  tahun       VARCHAR(4) NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pk_pejabat_unit_tahun_active (unit_kerja, tahun, is_active),
  INDEX idx_pk_pejabat_tahun (tahun, is_active),
  FOREIGN KEY (unit_kerja) REFERENCES pk_unit_kerja(nama_unit) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── pk_dokumen (header perjanjian kinerja) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS pk_dokumen (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  tahun                VARCHAR(4) NOT NULL,
  tanggal_dokumen      DATE NOT NULL,
  jenis_pk             ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI',
  unit_pertama         VARCHAR(255) NOT NULL,
  nama_pertama         VARCHAR(255) NOT NULL,
  jabatan_pertama      VARCHAR(255) NOT NULL,
  pangkat_pertama      VARCHAR(100),
  nip_pertama          VARCHAR(50),
  unit_kedua           VARCHAR(255) NOT NULL,
  nama_kedua           VARCHAR(255) NOT NULL,
  jabatan_kedua        VARCHAR(255) NOT NULL,
  pangkat_kedua        VARCHAR(100),
  nip_kedua            VARCHAR(50),
  status               ENUM('DRAFT','FINAL') NOT NULL DEFAULT 'DRAFT',
  generated_file       MEDIUMBLOB,
  generated_filesize   INT,
  generated_filename   VARCHAR(255),
  generated_at         DATETIME,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by           INT,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pk_dokumen_tahun  (tahun, status, jenis_pk),
  INDEX idx_pk_dokumen_creator(created_by),
  INDEX idx_pk_dokumen_pertama(unit_pertama, tahun),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── pk_dokumen_lampiran ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pk_dokumen_lampiran (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  dokumen_id   INT NOT NULL,
  unit_kerja   VARCHAR(255) NOT NULL,
  level        ENUM('program','kegiatan','subkegiatan') NOT NULL,
  program      VARCHAR(255),
  kegiatan     VARCHAR(255),
  subkegiatan  VARCHAR(255),
  uraian       VARCHAR(255) NOT NULL,
  indikator    VARCHAR(500),
  target       VARCHAR(255),
  urutan       INT DEFAULT 0,
  FOREIGN KEY (dokumen_id) REFERENCES pk_dokumen(id) ON DELETE CASCADE,
  INDEX idx_pk_lampiran_dokumen (dokumen_id, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── pk_dokumen_anggaran ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pk_dokumen_anggaran (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  dokumen_id               INT NOT NULL,
  unit_kerja               VARCHAR(255) NOT NULL,
  level                    ENUM('program','kegiatan','subkegiatan') NOT NULL,
  program                  VARCHAR(255),
  kegiatan                 VARCHAR(255),
  subkegiatan              VARCHAR(255),
  uraian                   VARCHAR(255) NOT NULL,
  keterangan_sumber        VARCHAR(50) NOT NULL,
  nominal                  DECIMAL(18,2) DEFAULT 0,
  urutan                   INT DEFAULT 0,
  auto_filled_from_blud    BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (dokumen_id) REFERENCES pk_dokumen(id) ON DELETE CASCADE,
  INDEX idx_pk_anggaran_dokumen (dokumen_id, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════════════
-- Selesai. MySQL 8.0.13+ required (functional index pada users).
-- ═══════════════════════════════════════════════════════════════════════════
