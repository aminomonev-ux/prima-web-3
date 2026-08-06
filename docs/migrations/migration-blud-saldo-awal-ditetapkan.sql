-- migration-blud-saldo-awal-ditetapkan.sql
-- Penanda "saldo awal tahun ini SUDAH pernah ditetapkan orang".
--
-- Kenapa perlu kolom sendiri: `saldo_awal_kas`/`_bank` NOT NULL DEFAULT 0,
-- sehingga "belum pernah diisi" dan "sengaja diisi 0" tersimpan sebagai nilai
-- yang sama persis. Barisnya pun bukan penanda — `kunciPeriode()` membuat baris
-- `blud_periode` lewat INSERT IGNORE hanya untuk keperluan penguncian.
--
-- Tanpa penanda ini, pengingat "saldo awal belum diisi" akan muncul selamanya di
-- rumah sakit yang saldo awalnya MEMANG nol — dan peringatan yang selalu menyala
-- padahal tidak ada yang salah akan berhenti dibaca orang.
--
-- Hanya baris bulan = 1 yang memakainya; bulan lain diturunkan (§4.6).

ALTER TABLE blud_periode
  ADD COLUMN saldo_awal_ditetapkan_at   DATETIME NULL
    COMMENT 'Kapan saldo awal tahun ditetapkan. NULL = belum pernah, dibedakan dari nilai 0',
  ADD COLUMN saldo_awal_ditetapkan_oleh INT      NULL
    COMMENT 'Siapa yang menetapkan — angka ini ikut ditandatangani di berita acara';

ALTER TABLE blud_periode
  ADD CONSTRAINT fk_bp_saldo_awal_user
    FOREIGN KEY (saldo_awal_ditetapkan_oleh) REFERENCES users(id) ON DELETE SET NULL;

-- Tahun yang sudah terlanjur punya angka bukan-nol jelas pernah ditetapkan orang,
-- jadi jangan diganggu pengingat. Waktunya tidak diketahui — dibiarkan menebak
-- dari `ditutup_at` bila ada, kalau tidak pakai waktu migrasi dijalankan.
UPDATE blud_periode
   SET saldo_awal_ditetapkan_at = COALESCE(ditutup_at, NOW())
 WHERE bulan = 1
   AND saldo_awal_ditetapkan_at IS NULL
   AND (saldo_awal_kas <> 0 OR saldo_awal_bank <> 0);
