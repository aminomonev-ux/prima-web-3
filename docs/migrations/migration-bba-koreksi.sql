-- BBA Tahap F — koreksi salah input di Buku Aset (docs/CONCEPT-bba-buku-aset.md §20).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang, SESUDAH migration-bba-penerimaan.sql:
-- "Batalkan penghapusan" menulis riwayat berjenis BATAL_HAPUS — tanpa nilai ENUM ini simpanannya gagal.
--
-- Tanpa kolom/tabel baru. Batalkan penempatan membuang baris aset (belum teregister, lahir dari Tempatkan)
-- beserta riwayatnya lewat FK CASCADE yang sudah ada; betulkan register & SK memakai jenis REGISTER / UBAH.

ALTER TABLE bba_aset_riwayat
  MODIFY jenis ENUM('IMPOR','UBAH','KONDISI','PINDAH','TERIMA','REGISTER','REHAB','HAPUS','BATAL_HAPUS') NOT NULL;
