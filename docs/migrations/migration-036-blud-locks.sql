-- Migration 036: optimistic locking generic untuk BLUD entities (cegah R1 lost update).
-- Pattern: 1 tabel cover semua entity yg pakai whole-version DELETE+INSERT
-- (dpa_blud, pergeseran_dpa, master_akun, kode_besar, penanggung_jawab, rekap_pk).
--
-- Flow save:
--   1. Server lock baris (SELECT ... FOR UPDATE WHERE entity=? AND key_id=?)
--   2. Cek version match dengan client expectedVersion
--   3. Kalau mismatch -> throw BludVersionConflictError -> 409 Conflict
--   4. Kalau OK -> DELETE+bulkInsert -> INSERT lock OR UPDATE version+1
--
-- key_id konvensi:
--   - Per-versi entity (dpa_blud, pergeseran_dpa, rekap_pk): versi_tanggal as YYYY-MM-DD string
--   - Global entity (master_akun, kode_besar, penanggung_jawab): 'singleton'
--
-- Initial row dibuat ON-DEMAND via INSERT ON DUPLICATE KEY UPDATE saat save pertama,
-- BUKAN seed migration (tidak perlu backfill existing data).

CREATE TABLE IF NOT EXISTS blud_locks (
  entity        VARCHAR(50)  NOT NULL,
  key_id        VARCHAR(100) NOT NULL,
  version       INT          NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by    INT          NULL,
  PRIMARY KEY (entity, key_id),
  INDEX idx_entity (entity),
  CONSTRAINT fk_blud_locks_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
