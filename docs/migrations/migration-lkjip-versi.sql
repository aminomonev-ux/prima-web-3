-- ═══════════════════════════════════════════════════════════════════════════
-- Migration — LKJIP versi/riwayat (hybrid: snapshot JSON di DB + docx di Drive)
-- "Simpan Versi" → 1 baris snapshot (struktur bab+blok) untuk PULIHKAN/edit-ulang,
-- plus drive_file_id (docx ber-tanggal yang diunggah ke Drive, best-effort).
-- List riwayat hanya baca metadata (JANGAN select kolom snapshot) → anti-lemot.
-- Retention: app simpan N versi terakhir per dokumen (prune di data layer).
-- MySQL 8.4. Idempotent via IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lkjip_versi (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dokumen_id    BIGINT UNSIGNED NOT NULL,
  versi_no      INT             NOT NULL COMMENT 'Nomor urut per-dokumen (tampilan)',
  label         VARCHAR(255)    NULL COMMENT 'Catatan versi (opsional)',
  snapshot      JSON            NOT NULL COMMENT 'Struktur bab+blok+style utk PULIHKAN',
  drive_file_id VARCHAR(64)     NULL COMMENT 'File docx arsip di Google Drive',
  drive_name    VARCHAR(255)    NULL,
  created_by    INT             NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lkv_dok (dokumen_id, versi_no),
  CONSTRAINT fk_lkv_dokumen FOREIGN KEY (dokumen_id) REFERENCES lkjip_dokumen(id) ON DELETE CASCADE,
  CONSTRAINT fk_lkv_user    FOREIGN KEY (created_by) REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='LKJIP — snapshot versi dokumen (riwayat + pulihkan/edit-ulang)';
