-- Migration 013: Modul BLUD — DPA BLUD & Pergeseran DPA
-- Ported dari blud-app ke prima-web (MySQL)
-- Jalankan sekali: mysql -u root -p prima_db < migrations/013_add_blud_dpa_pergeseran.sql

-- ─── TIPE BARIS (dipakai di kedua tabel) ────────────────────────────────────
-- GRANDMASTER : 5.X / 5.1 / dst (total akumulasi teratas)
-- MASTER      : 5.1.1 dst (sub-kelompok belanja)
-- CHILD       : baris daun tanpa sub-hierarki
-- LEADER      : grup pemimpin → sum MEMBER
-- MEMBER      : anggota LEADER (leaf)
-- PLETON-LEADER   : pemimpin pleton → sum PLETON-MEMBER
-- PLETON-MEMBER   : anggota pleton, bisa leaf atau punya KETUA-KELOMPOK-A
-- KETUA-KELOMPOK-A  : sum ANGGOTA-A + KETUA-B
-- ANGGOTA-KELOMPOK-A: leaf
-- KETUA-KELOMPOK-B  : sum ANGGOTA-B
-- ANGGOTA-KELOMPOK-B: leaf

-- ─── DPA BLUD ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dpa_blud (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  versi_tanggal   DATE         NOT NULL COMMENT 'Tanggal versi/history DPA',
  is_latest       TINYINT   NOT NULL DEFAULT 1,
  kode_rekening   VARCHAR(64)  NOT NULL DEFAULT '',
  uraian          TEXT         NOT NULL,
  vol             DECIMAL(18,4)    NULL,
  satuan          VARCHAR(32)      NULL,
  harga           DECIMAL(18,2)    NULL,
  jumlah          DECIMAL(18,2)    NOT NULL DEFAULT 0,
  penanggung_jawab VARCHAR(128)    NULL,
  keterangan      TEXT             NULL,
  tipe_baris      ENUM(
    'GRANDMASTER','MASTER','CHILD',
    'LEADER','MEMBER',
    'PLETON-LEADER','PLETON-MEMBER',
    'KETUA-KELOMPOK-A','ANGGOTA-KELOMPOK-A',
    'KETUA-KELOMPOK-B','ANGGOTA-KELOMPOK-B'
  ) NOT NULL DEFAULT 'CHILD',
  row_id          VARCHAR(64)      NULL COMMENT 'UUID baris, unik per versi',
  parent_id       VARCHAR(64)      NULL COMMENT 'row_id parent',
  urutan          INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_versi_latest  (versi_tanggal, is_latest),
  INDEX idx_row_id        (row_id),
  INDEX idx_parent_id     (parent_id),
  INDEX idx_urutan        (versi_tanggal, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DPA BLUD — rencana anggaran';

-- ─── PERGESERAN DPA ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pergeseran_dpa (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  versi_tanggal       DATE         NOT NULL COMMENT 'Tanggal versi pergeseran',
  dpa_versi_tanggal   DATE         NOT NULL COMMENT 'Versi DPA yang menjadi acuan',
  is_latest           TINYINT   NOT NULL DEFAULT 1,

  -- Kolom 0-5: disalin dari DPA, di-inject ulang saat ada perubahan DPA
  kode_rekening       VARCHAR(64)  NOT NULL DEFAULT '',
  uraian              TEXT         NOT NULL,
  vol                 DECIMAL(18,4)    NULL,
  satuan              VARCHAR(32)      NULL,
  harga               DECIMAL(18,2)    NULL,
  jumlah              DECIMAL(18,2)    NOT NULL DEFAULT 0,

  -- Kolom 6+: diisi user, TIDAK boleh ditimpa oleh inject
  vol_p               DECIMAL(18,4)    NULL    COMMENT 'Volume pergeseran',
  harga_p             DECIMAL(18,2)    NULL    COMMENT 'Harga pergeseran',
  pergeseran          DECIMAL(18,2)    NOT NULL DEFAULT 0,
  bertambah_berkurang DECIMAL(18,2)    NOT NULL DEFAULT 0,

  tipe_baris          ENUM(
    'GRANDMASTER','MASTER','CHILD',
    'LEADER','MEMBER',
    'PLETON-LEADER','PLETON-MEMBER',
    'KETUA-KELOMPOK-A','ANGGOTA-KELOMPOK-A',
    'KETUA-KELOMPOK-B','ANGGOTA-KELOMPOK-B'
  ) NOT NULL DEFAULT 'CHILD',
  row_id              VARCHAR(64)      NULL,
  parent_id           VARCHAR(64)      NULL,
  urutan              INT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_versi_latest  (versi_tanggal, is_latest),
  INDEX idx_dpa_versi     (dpa_versi_tanggal),
  INDEX idx_row_id        (row_id),
  INDEX idx_parent_id     (parent_id),
  INDEX idx_urutan        (versi_tanggal, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Pergeseran DPA — perubahan anggaran';

-- ─── History view (opsional, untuk dropdown history) ─────────────────────────

CREATE OR REPLACE VIEW v_dpa_history AS
  SELECT DISTINCT versi_tanggal, COUNT(*) AS jumlah_baris
  FROM dpa_blud
  GROUP BY versi_tanggal
  ORDER BY versi_tanggal DESC;

CREATE OR REPLACE VIEW v_pergeseran_history AS
  SELECT DISTINCT versi_tanggal, dpa_versi_tanggal, COUNT(*) AS jumlah_baris
  FROM pergeseran_dpa
  GROUP BY versi_tanggal, dpa_versi_tanggal
  ORDER BY versi_tanggal DESC;
