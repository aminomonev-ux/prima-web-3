-- Migration: riwayat versi IKI — snapshot JSON saat FINALIZE/UNFINALIZE
-- Pola ringkas lkjip_versi: metadata + snapshot utuh, retention 20/dokumen (di app).
-- Jalankan di database PRIMA (MySQL 8).

CREATE TABLE IF NOT EXISTS iki_versi (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  dokumen_id  INT NOT NULL,
  versi_ke    INT NOT NULL,
  pemicu      ENUM('FINALIZE','UNFINALIZE') NOT NULL,
  snapshot    JSON NOT NULL COMMENT 'IkiDokumenDetail utuh (header + RHK + triwulan)',
  created_by  INT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iki_versi (dokumen_id, versi_ke),
  CONSTRAINT fk_iki_versi_dok FOREIGN KEY (dokumen_id) REFERENCES iki_dokumen(id) ON DELETE CASCADE,
  CONSTRAINT fk_iki_versi_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='IKI - riwayat versi (snapshot otomatis saat finalize/unfinalize)';
