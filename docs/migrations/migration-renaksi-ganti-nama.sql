-- migration-renaksi-ganti-nama.sql
-- Tabel `renaksi_ganti_nama`: jejak ganti nama entitas Rencana Aksi.
-- Konsep: docs/CONCEPT-renaksi-terhubung.md §4 (Tahap A).
--
-- KENAPA: E-Anggaran, PK, dan IKI menyalin nama program/kegiatan/sub kegiatan dari
-- Renaksi. Entitas Renaksi tidak punya id (hierarkinya disambung teks nama), jadi tanpa
-- catatan ini sebuah ganti nama hanya bisa terbaca sebagai "satu hilang + satu baru".
--
-- Ditulis upsertRencanaAksi (lib/data/rencana-aksi.ts) di transaksi yang SAMA dengan
-- penjalaran nama. Ganti nama yang terjadi sebelum tabel ini ada tidak tercatat — makin
-- cepat dipasang, makin sedikit yang terbaca "hilang + baru".
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: tanpa tabel ini setiap
-- ganti nama entitas di Data Entry Renaksi gagal (transaksinya dibatalkan).

CREATE TABLE renaksi_ganti_nama (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun         SMALLINT UNSIGNED NOT NULL,
  level         ENUM('tujuan','sasaran','program','kegiatan','sub-kegiatan') NOT NULL,
  dari          VARCHAR(255) NOT NULL,
  ke            VARCHAR(255) NOT NULL,
  induk         VARCHAR(255) NULL COMMENT 'Induk langsung LAMA — membedakan entitas senama',
  induk_program VARCHAR(255) NULL COMMENT 'Program lama; hanya level sub-kegiatan',
  dicatat_pada  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  oleh          INT          NULL,
  INDEX idx_rgn_tahun (tahun, id),
  CONSTRAINT fk_rgn_oleh FOREIGN KEY (oleh) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Jejak ganti nama entitas Rencana Aksi untuk modul yang menyalin namanya';
