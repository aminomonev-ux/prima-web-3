-- migration-blud-riwayat-simpan.sql
-- Riwayat tiap klik Simpan DPA/Pergeseran — sampai jam & menit.
--
-- MASALAH: Simpan itu hapus-lalu-tulis-ulang untuk (tahun_anggaran, versi_tanggal)
-- yang sama. Simpan jam 16:40 MENGHAPUS hasil simpan jam 09:15 tanpa sisa. Yang
-- tercatat hanya peristiwanya di `audit_log` (BLUD_SAVE_DPA — siapa, jam berapa,
-- berapa baris), bukan isinya.
--
-- KENAPA TABEL BARU, BUKAN `versi_tanggal` DIUBAH JADI DATETIME:
-- kolom itu dipakai 298 kali di 38 berkas dan menjadi kunci sambung antar-modul
-- (pergeseran_dpa.dpa_versi_tanggal, rekap_pk.versi_dpa, buku_besar_aset.
-- dpa_versi_tanggal, lib/data/pk.ts, dashboard, rima). Mengubahnya jadi DATETIME
-- juga MELONGGARKAN pagar VERSI_DIRUJUK menjadi pencocokan per-detik: DPA jam
-- 09:15 tidak lagi terlindungi oleh pergeseran yang menunjuk 16:40 di hari yang
-- sama. Lebih banyak versi jadi bisa dihapus — arah yang berlawanan dengan L76.
-- Rinciannya di docs/CONCEPT-blud-riwayat-simpan.md §2.
--
-- Snapshot ini SENGAJA tidak dirujuk siapa pun. Ia catatan, bukan entitas.
-- Begitu ia bisa dirujuk, seluruh alasan di atas kembali berlaku.
--
-- Referensi: L77, docs/CONCEPT-blud-riwayat-simpan.md

CREATE TABLE IF NOT EXISTS blud_riwayat_simpan (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  jenis             ENUM('DPA','PERGESERAN') NOT NULL,
  tahun_anggaran    SMALLINT UNSIGNED NOT NULL,
  versi_tanggal     DATE          NOT NULL COMMENT 'Versi yang ditulis simpanan ini',
  disimpan_pada     DATETIME      NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  versi_ke          INT UNSIGNED  NOT NULL COMMENT 'Angka kunci sesudah simpan = simpan ke-n untuk versi itu',
  jumlah_baris      INT UNSIGNED  NOT NULL DEFAULT 0,
  total_nilai       DECIMAL(18,2) NOT NULL DEFAULT 0,
  dpa_versi_tanggal DATE              NULL COMMENT 'Acuan DPA — hanya untuk jenis PERGESERAN',
  isi               JSON          NOT NULL COMMENT 'Array baris, bentuknya sama dgn payload POST',
  disimpan_oleh     INT               NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_brs_versi   (jenis, tahun_anggaran, versi_tanggal, disimpan_pada),
  INDEX idx_brs_retensi (jenis, tahun_anggaran, id),
  CONSTRAINT fk_brs_user FOREIGN KEY (disimpan_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Riwayat tiap klik Simpan DPA/Pergeseran — snapshot, tidak dirujuk siapa pun';
