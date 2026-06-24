-- ═══════════════════════════════════════════════════════════════════════════
-- PRIMA — E-Anggaran Migration Phase 5
-- Jalankan di MySQL 8.0+ setelah migration-kinerja-phase34.sql
-- ═══════════════════════════════════════════════════════════════════════════

USE prima_db;

-- ─── TAMBAH TIPE 'sumber_anggaran' KE kinerja_master ─────────────────────────
-- Menambahkan nilai enum baru agar Master Rekening bisa menyimpan
-- daftar Sumber Anggaran (misal: APBD, BLUD, DAK, DBHCHT, dll)

ALTER TABLE kinerja_master
  MODIFY COLUMN tipe ENUM(
    'program',
    'kegiatan',
    'subkegiatan',
    'uraian_ssk',
    'sumber_anggaran'
  ) NOT NULL;
