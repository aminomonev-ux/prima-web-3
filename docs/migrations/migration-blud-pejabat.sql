-- ─────────────────────────────────────────────────────────────────────────────
-- migration-blud-pejabat.sql — Pejabat penanda tangan dokumen SPJ BLUD
-- Konsep: docs/CONCEPT-blud-realisasi.md §3.1, §6, Fase 5
--
-- Apply:
--   mysql -u root -p prima_db_3 < docs/migrations/migration-blud-pejabat.sql
--
-- KEPUTUSAN #29 — nilai DISALIN dari pk_pejabat, BUKAN di-JOIN hidup.
-- pk_pejabat boleh dipakai sebagai sumber isian (tombol "Ambil dari PK"), tapi
-- yang disimpan di sini adalah SALINAN nama/NIP/pangkat pada saat penetapan.
-- Kalau tahun depan pejabatnya berganti di master PK, SPJ tahun ini yang sudah
-- dicetak & ditandatangani TIDAK boleh ikut berubah — itu dokumen
-- pertanggungjawaban keuangan. Karena itu:
--   - TIDAK ADA foreign key ke pk_pejabat (sengaja) — hanya jejak `pk_pejabat_id`
--     sebagai keterangan asal, boleh menggantung kalau baris PK-nya dihapus
--   - `jabatan_teks` disimpan terpisah dari ENUM `jabatan` supaya yang tercetak
--     di blok tanda tangan persis bunyi jabatan resminya
--
-- pk_pejabat sendiri hanya memuat jabatan STRUKTURAL (Direktur/Wadir/Kabid/
-- Kabag/Kasubbag). Peran perbendaharaan (Bendahara Pengeluaran, PPK-BLUD) tidak
-- ada di sana, jadi peran BLUD tetap didefinisikan sendiri di kolom `jabatan`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blud_pejabat (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  jabatan        ENUM('DIREKTUR','BENDAHARA','PPK') NOT NULL COMMENT 'peran di dokumen SPJ',
  nama           VARCHAR(128) NOT NULL,
  nip            VARCHAR(32)      NULL,
  pangkat        VARCHAR(64)      NULL,
  jabatan_teks   VARCHAR(191)     NULL COMMENT 'bunyi jabatan yang dicetak di blok tanda tangan',
  pk_pejabat_id  INT              NULL COMMENT 'jejak asal salinan — SENGAJA tanpa FK (§keputusan #29)',
  disalin_at     DATETIME         NULL COMMENT 'kapan disalin dari PK',
  updated_by     INT              NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tahun_jabatan (tahun_anggaran, jabatan),
  CONSTRAINT fk_bpj_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Pejabat penanda tangan dokumen SPJ (salinan beku dari pk_pejabat)';
