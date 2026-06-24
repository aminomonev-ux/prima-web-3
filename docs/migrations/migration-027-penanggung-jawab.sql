CREATE TABLE IF NOT EXISTS penanggung_jawab (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(255)  NOT NULL,
  urutan      INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_label (label),
  INDEX idx_urutan (urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO penanggung_jawab (label, urutan) VALUES
  ('Kasubbag Perbendaharaan',                       0),
  ('Kasubbag Akuntansi',                            1),
  ('Kasubbag Pengembangan Pendapatan',              2),
  ('Kasubbag Rumah Tangga',                         3),
  ('Kasubbag TU, Hukum & Humas',                    4),
  ('Kasubbag Organisasi & Kepegawaian',             5),
  ('Kasubbag Pendidikan & Pengembangan',            6),
  ('Kasubag Program',                               7),
  ('Kasubbag Manajemen Data & Sistem Informasi',    8),
  ('Kasi Penunjang Medis',                          9),
  ('Kasi Penunjang Non Medis',                     10),
  ('Kabid Pelayanan',                              11),
  ('Kabid Keperawatan',                            12);
