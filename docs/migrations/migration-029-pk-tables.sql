-- ═══ Migration 029 — Perjanjian Kinerja (PK) ═════════════════════════════════
-- SDL-Audit compliant + idempotent (cek INFORMATION_SCHEMA sebelum CREATE).
-- 8 tabel: pk_sasaran, pk_program, pk_unit_kerja, pk_unit_kerja_blud_pj,
--          pk_pejabat, pk_dokumen, pk_dokumen_lampiran, pk_dokumen_anggaran.
-- Reference: docs/session/PK_REFACTOR_CONCEPT.md §3
--
-- Apply:
--   mysql -u root -p prima_db < docs/migrations/migration-029-pk-tables.sql
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── 1. pk_sasaran (Master Sasaran — referensi indikator + target) ───────────
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

-- ─── 2. pk_program (Master Program — hierarki program/kegiatan/sub) ──────────
-- NOTE: UNIQUE KEY pakai prefix index — utf8mb4 = 4 byte/char, sum VARCHAR full
-- (4+255+255+255)*4 = 3076 byte (> max 3072 byte InnoDB).
-- Prefix 150 chars cukup untuk uniqueness (nama program di RSJD typical 50-100 chars).
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

-- ─── 3. pk_unit_kerja (struktur organisasi + atasan_default) ─────────────────
-- Naming HARUS exact match dengan penanggung_jawab.label (migration 027) untuk
-- support exact-match BLUD lookup di sub-keg level.
-- "Kasubag Program" (single b) intentional — match eksisting penanggung_jawab seed.
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

-- ─── 4. pk_unit_kerja_blud_pj (mapping aggregate BLUD lookup) ────────────────
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

-- ─── 5. pk_pejabat (referensi nama/jabatan/pangkat/NIP per unit per tahun) ───
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

-- DUMMY seed untuk smoke-test Sprint 2. Admin replace via UI di Sprint 5/6.
INSERT IGNORE INTO pk_pejabat (unit_kerja, nama, jabatan, pangkat, nip, tahun, is_active) VALUES
  ('Direktur',                'dr. Dummy Direktur, Sp.KJ',    'Direktur RSJD Dr. Amino',   'IV/c', '197001011990031001', '2026', TRUE),
  ('Wadir Pelayanan',         'dr. Dummy Wadir Y, Sp.KJ',     'Wadir Pelayanan',           'IV/b', '197001011990031002', '2026', TRUE),
  ('Wadir Umum dan Keuangan', 'Dummy Wadir Z, S.E., M.M.',    'Wadir Umum dan Keuangan',   'IV/b', '197001011990031003', '2026', TRUE),
  ('Kabid Pelayanan',         'Dummy Kabid Pelayanan',        'Kabid Pelayanan',           'IV/a', '197001011990031004', '2026', TRUE),
  ('Kabag Keuangan',          'Dummy Kabag Keuangan',         'Kabag Keuangan',            'III/d','197001011990031005', '2026', TRUE),
  ('Kasubbag Akuntansi',      'Dummy Kasubbag Akuntansi',     'Kasubbag Akuntansi',        'III/c','197001011990031006', '2026', TRUE);

-- ─── 6. pk_dokumen (header perjanjian kinerja) ───────────────────────────────
-- Pihak Pertama = BAWAHAN. Pihak Kedua = ATASAN.
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

-- ─── 7. pk_dokumen_lampiran ──────────────────────────────────────────────────
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

-- ─── 8. pk_dokumen_anggaran ──────────────────────────────────────────────────
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

SELECT 'Migration 029 selesai. 8 tabel PK + seed unit_kerja (19) + mapping (15) + dummy pejabat (6).' AS status;
