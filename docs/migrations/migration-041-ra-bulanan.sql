-- ═══ Migration 041 — Rencana Aksi: Target/Realisasi Bulanan (Renaksi & Kinerja) ═══
-- Opsi A: bulanan jadi SUMBER. TW (q1-q4) di-derive dari bulanan per `jenis`:
--   Akumulatif            → TWn = SUM 3 bulan dalam triwulan itu
--   Progres Pos/Neg/Ulang → TWn = nilai bulan TERAKHIR terisi dalam triwulan itu (snapshot)
-- Tahunan/RPJMD TETAP input manual (tidak diturunkan dari bulanan).
-- Hanya relevan level sub-kegiatan (NULL untuk level lain & data legacy).
-- JSON array 12 angka (index 0=Jan .. 11=Des). Mirror pola kinerja_ssk.months.

ALTER TABLE rencana_aksi
  ADD COLUMN bulan_target JSON NULL DEFAULT NULL
    COMMENT '12 target bulanan (sub-kegiatan); sumber derive q1-q4 target';

ALTER TABLE rencana_aksi
  ADD COLUMN bulan_realisasi JSON NULL DEFAULT NULL
    COMMENT '12 realisasi bulanan (sub-kegiatan); reserved untuk derive realisasi (Realisasi menu)';
