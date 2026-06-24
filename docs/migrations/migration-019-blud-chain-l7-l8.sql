-- Migration 019: BLUD chain extension L7 + L8 (kedalaman hierarki s/d L8.1)
-- Tambah 4 enum value baru di tipe_baris pada `dpa` & `pergeseran_dpa`.
-- Tidak ada data lama yang berubah — strict additive.
--
-- CHAIN RULE (post-migration):
--   GRANDMASTER → MASTER → CHILD → LEADER → MEMBER → PLETON-LEADER →
--   PLETON-MEMBER → KETUA-KELOMPOK-A → ANGGOTA-KELOMPOK-A →
--   KETUA-KELOMPOK-B → ANGGOTA-KELOMPOK-B → L7-HEAD → L7-SUB →
--   L8-HEAD → L8-SUB (leaf max)
--
-- Setiap parent tipe spawn TEPAT 1 anak tipe (chain ketat, tanpa branching).
-- Data lama yang sebelumnya pakai struktur fleksibel (MASTER → CHILD+LEADER
-- bersamaan, atau KETUA-A → ANGGOTA-A+KETUA-B bersamaan) tetap valid secara
-- SUM (recalc bottom-up tidak peduli tipe child), hanya UI yang strict.
--
-- Audit data lama: gunakan validateChainRule() di lib/blud/recalc.ts untuk
-- detect violations sebelum apply migration ini ke produksi.
--
-- Query manual audit (optional):
--   SELECT d.row_id, d.uraian, p.tipe_baris AS parent_tipe, d.tipe_baris AS child_tipe
--   FROM dpa_blud d JOIN dpa_blud p ON p.row_id = d.parent_id AND p.versi_tanggal = d.versi_tanggal
--   WHERE d.is_latest = 1 AND p.is_latest = 1
--     AND NOT (
--       (p.tipe_baris = 'GRANDMASTER'         AND d.tipe_baris = 'MASTER')
--       OR (p.tipe_baris = 'MASTER'              AND d.tipe_baris = 'CHILD')
--       OR (p.tipe_baris = 'CHILD'               AND d.tipe_baris = 'LEADER')
--       OR (p.tipe_baris = 'LEADER'              AND d.tipe_baris = 'MEMBER')
--       OR (p.tipe_baris = 'MEMBER'              AND d.tipe_baris = 'PLETON-LEADER')
--       OR (p.tipe_baris = 'PLETON-LEADER'       AND d.tipe_baris = 'PLETON-MEMBER')
--       OR (p.tipe_baris = 'PLETON-MEMBER'       AND d.tipe_baris = 'KETUA-KELOMPOK-A')
--       OR (p.tipe_baris = 'KETUA-KELOMPOK-A'    AND d.tipe_baris = 'ANGGOTA-KELOMPOK-A')
--       OR (p.tipe_baris = 'ANGGOTA-KELOMPOK-A'  AND d.tipe_baris = 'KETUA-KELOMPOK-B')
--       OR (p.tipe_baris = 'KETUA-KELOMPOK-B'    AND d.tipe_baris = 'ANGGOTA-KELOMPOK-B')
--       OR (p.tipe_baris = 'ANGGOTA-KELOMPOK-B'  AND d.tipe_baris = 'L7-HEAD')
--       OR (p.tipe_baris = 'L7-HEAD'             AND d.tipe_baris = 'L7-SUB')
--       OR (p.tipe_baris = 'L7-SUB'              AND d.tipe_baris = 'L8-HEAD')
--       OR (p.tipe_baris = 'L8-HEAD'             AND d.tipe_baris = 'L8-SUB')
--     );

ALTER TABLE dpa_blud
  MODIFY COLUMN tipe_baris ENUM(
    'GRANDMASTER','MASTER','CHILD','LEADER','MEMBER',
    'PLETON-LEADER','PLETON-MEMBER',
    'KETUA-KELOMPOK-A','ANGGOTA-KELOMPOK-A',
    'KETUA-KELOMPOK-B','ANGGOTA-KELOMPOK-B',
    'L7-HEAD','L7-SUB','L8-HEAD','L8-SUB'
  ) NOT NULL DEFAULT 'CHILD';

ALTER TABLE pergeseran_dpa
  MODIFY COLUMN tipe_baris ENUM(
    'GRANDMASTER','MASTER','CHILD','LEADER','MEMBER',
    'PLETON-LEADER','PLETON-MEMBER',
    'KETUA-KELOMPOK-A','ANGGOTA-KELOMPOK-A',
    'KETUA-KELOMPOK-B','ANGGOTA-KELOMPOK-B',
    'L7-HEAD','L7-SUB','L8-HEAD','L8-SUB'
  ) NOT NULL DEFAULT 'CHILD';
