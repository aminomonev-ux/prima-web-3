-- ═══ MIGRATION 024 — Rekap Penanggung Jawab (BLUD) ═══════════════════════════
-- Tabel snapshot rekap PJ — output dari menu Cetak BLUD view "Penanggung Jawab".
-- Pattern: pengguna klik "Simpan Rekap PK" → DELETE old snapshot + INSERT all rows
-- (replace latest). Dibungkus withTransaction supaya atomic (anti-pattern L4).
--
-- Kenapa snapshot bukan derived view: rekap PJ adalah agregasi cross-row di waktu
-- tertentu (Σ jumlah per PJ di versi DPA tertentu). Dengan snapshot, hasil
-- audit/laporan stabil walau DPA jalan diubah belakangan.
--
-- Idempotent: pakai IF NOT EXISTS supaya bisa di-run ulang aman.
-- Apply via: mysql -u <user> -p <db> < docs/migrations/migration-024-rekap-pk.sql

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
  COMMENT='BLUD - Snapshot rekap Penanggung Jawab (output menu Cetak)';
