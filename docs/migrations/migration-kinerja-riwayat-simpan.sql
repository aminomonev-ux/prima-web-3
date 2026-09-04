-- migration-kinerja-riwayat-simpan.sql
-- Riwayat tiap klik Simpan SSK / Realisasi / Rekening di modul E-Anggaran.
--
-- MASALAH: ketiga jalur itu berpola hapus-lalu-tulis-ulang untuk (tahun, sumber)
-- yang sama. Simpanan sore MENGHAPUS hasil pagi tanpa sisa, dan `kinerja_realisasi`
-- tidak punya riwayat apa pun untuk memulihkannya — BLUD punya dua lapis
-- (`blud_riwayat_simpan` + cadangan JSON ke Drive), modul ini nol.
--
-- Tahap 0b sudah menutup dua kecelakaan terbesar (payload kosong & penurunan
-- drastis, dijawab 409 sebelum DELETE jalan). Yang tersisa adalah simpanan yang
-- SAH tapi salah isi: 180 baris masuk, 180 baris keluar, tidak ada ambang mana
-- pun yang bisa menyalak. Tabel ini menutup sisanya.
--
-- KENAPA versi_tipe/versi_seq BOLEH NULL:
-- NULL di sini berarti "pertanyaannya tidak berlaku", bukan "belum diisi".
-- Realisasi & Rekening di-DELETE per (tahun, sumber) tanpa dimensi versi sama
-- sekali; mengisinya 'MURNI',0 akan terbaca seolah keduanya tersimpan per-versi.
-- Harganya satu operator: pemangkasan retensi WAJIB memakai `<=>` (sama-dengan
-- yang aman-NULL). `versi_tipe = NULL` tidak pernah bernilai benar, jadi `=`
-- membuat riwayat Realisasi tidak pernah dipangkas — tumbuh terus tanpa gejala.
--
-- KENAPA versi_ke BOLEH NULL:
-- `saveRekeningBatch` memang tidak punya gembok optimistik. Mengarang angka di
-- situ berbohong tentang sesuatu yang tidak ada.
--
-- Snapshot ini SENGAJA tidak dirujuk siapa pun. Ia catatan, bukan entitas.
--
-- Referensi: L69, L87, docs/CONCEPT-kinerja-riwayat-simpan.md

CREATE TABLE IF NOT EXISTS kinerja_riwayat_simpan (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  jenis          ENUM('SSK','REALISASI','REKENING') NOT NULL,
  tahun          VARCHAR(10)   NOT NULL COMMENT 'Ikut kinerja_* — VARCHAR, bukan SMALLINT',
  sumber         ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS',
                      'OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  versi_tipe     ENUM('MURNI','PERUBAHAN') NULL
                 COMMENT 'NULL = jenis ini tidak berversi (REALISASI, REKENING)',
  versi_seq      TINYINT       NULL,
  disimpan_pada  DATETIME      NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  versi_ke       INT UNSIGNED  NULL COMMENT 'Angka gembok sesudah bump. NULL = jenis tanpa gembok',
  jumlah_baris   INT UNSIGNED  NOT NULL DEFAULT 0,
  total_nilai    DECIMAL(18,2) NOT NULL DEFAULT 0,
  isi            JSON          NOT NULL COMMENT 'Baris apa adanya, bentuk sama dgn payload PUT',
  disimpan_oleh  INT               NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_krs_lingkup (jenis, tahun, sumber, versi_tipe, versi_seq, disimpan_pada),
  INDEX idx_krs_retensi (jenis, tahun, sumber, id),
  CONSTRAINT fk_krs_user FOREIGN KEY (disimpan_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Riwayat tiap klik Simpan SSK/Realisasi/Rekening — snapshot, tidak dirujuk siapa pun';
