-- migration-pergeseran-pj.sql
-- Kolom `penanggung_jawab` + `keterangan` pada pergeseran_dpa.
--
-- KENAPA: `dpa_blud` punya kedua kolom ini, `pergeseran_dpa` tidak. Akibatnya begitu
-- anggaran digeser, catatan siapa pemilik tiap pos LENYAP dari dokumen — dan menu
-- Cetak hanya bisa menyusun "Rekap Penanggung Jawab" dari DPA, memakai angka SEBELUM
-- pergeseran. Justru sesudah digeser angkanya berubah, jadi rekap yang bisa dicetak
-- adalah rekap yang sudah kedaluwarsa.
--
-- Kolomnya CERMIN dari DPA, bukan isian mandiri: `injectDpaKePergeseran` menimpanya
-- dari baris DPA yang cocok, sama perlakuannya dengan uraian/vol/harga. Yang boleh
-- diisi manusia di layar Pergeseran hanya baris yang lahir di situ (row_id `pgnew_*`)
-- — persis aturan yang sudah berlaku untuk kode_rekening & uraian.
--
-- pergeseran_dpa adalah snapshot per-versi, jadi menyimpannya (bukan JOIN ke DPA saat
-- cetak) memang disengaja: versi DPA acuannya bisa berubah belakangan, dokumen
-- pergeseran yang sudah terbit tidak boleh ikut berubah.
--
-- Panjang mengikuti dpa_blud persis: VARCHAR(128) dan TEXT.

ALTER TABLE pergeseran_dpa
  ADD COLUMN penanggung_jawab VARCHAR(128) NULL DEFAULT NULL
    COMMENT 'Cermin dpa_blud.penanggung_jawab — snapshot per versi pergeseran'
    AFTER bertambah_berkurang,
  ADD COLUMN keterangan TEXT NULL DEFAULT NULL
    COMMENT 'Cermin dpa_blud.keterangan — snapshot per versi pergeseran'
    AFTER penanggung_jawab;
