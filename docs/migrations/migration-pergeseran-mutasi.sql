-- migration-pergeseran-mutasi.sql
-- Catatan Perpindahan pada Pergeseran BLUD.
-- Konsep: docs/CONCEPT-blud-catatan-perpindahan.md
--
-- Satu baris = satu perpindahan uang dari satu rekening ke rekening lain di
-- dalam SATU versi pergeseran. Dari situ kolom Bertambah/Berkurang dihitung —
-- tidak lagi diketik tangan, dan tidak lagi bisa salah ditebak waktu pagunya
-- dibetulkan.
--
-- `dari_row` / `ke_row` menunjuk `pergeseran_dpa.row_id`, BUKAN `anggaran_key`.
-- Alasannya: catatan ini foto per-versi, persis seperti barisnya, dan `row_id`
-- adalah identitas baris DI DALAM versi — sama dengan yang sudah dipakai
-- `parent_id`. `anggaran_key` baru dicetak server saat Simpan
-- (`ensureAnggaranKey`), jadi baris yang baru ditambahkan di layar belum
-- punya jangkar dan tidak akan bisa dicatat perpindahannya sampai disimpan.
--
-- Soft-FK: tidak ada FOREIGN KEY ke pergeseran_dpa karena barisnya
-- hapus-lalu-tulis-ulang tiap Simpan. Keberadaan row_id-nya diperiksa di
-- lapisan aplikasi, di transaksi yang sama dengan penulisan barisnya.

CREATE TABLE IF NOT EXISTS pergeseran_mutasi (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tahun_anggaran  SMALLINT UNSIGNED NOT NULL,
  versi_tanggal   DATE NOT NULL,
  dari_row        VARCHAR(64) NOT NULL COMMENT 'pergeseran_dpa.row_id pada versi yang sama',
  ke_row          VARCHAR(64) NOT NULL COMMENT 'pergeseran_dpa.row_id pada versi yang sama',
  nilai           DECIMAL(18,2) NOT NULL,
  keterangan      VARCHAR(255) NULL DEFAULT NULL,
  urutan          INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_mutasi_versi (tahun_anggaran, versi_tanggal, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
