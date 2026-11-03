-- migration-kinerja-pendapatan-perubahan.sql
-- Target Pendapatan Perubahan (tab Pendapatan & CRR, E-Anggaran).
--
-- MASALAH: target pendapatan satu kolom per bulan. Saat target berubah di Perubahan
-- anggaran, mengetik angka baru menimpa target murni — perbandingan "Target Murni vs
-- Target Perubahan" hilang dan tidak bisa dilaporkan.
--
-- ATURANNYA (lib/kinerja/pendapatan-perubahan.ts):
--   - target_perubahan NULL = belum ada Perubahan; target berlaku = target_perubahan ?? target.
--   - Capaian dihitung dari target berlaku, di server.
--   - Sesudah Target Perubahan tersimpan, Target Murni final (409 TARGET_MURNI_FINAL).
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: GET & Simpan Pendapatan
-- membaca/menulis kolom ini.
--
-- Referensi: docs/CONCEPT-kinerja-pendapatan-perubahan.md

ALTER TABLE kinerja_pendapatan_real
  ADD COLUMN target_perubahan DECIMAL(18,2) NULL DEFAULT NULL
    COMMENT 'Target Perubahan bulan ini; NULL = belum ada Perubahan (target berlaku = target murni)' AFTER target;
