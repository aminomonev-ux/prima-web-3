-- migration-kinerja-bulan-tutup.sql
-- Tutup Bulan Realisasi E-Anggaran — angka bulan yang sudah dilaporkan dikunci.
--
-- MASALAH: Simpan Realisasi menghapus lalu menulis ulang SETAHUN per (tahun, sumber).
-- Januari yang sudah dikirim ke pusat bisa berubah tanpa tanda apa pun oleh siapa saja
-- yang membuka bulan itu lalu menyimpan.
--
-- ATURANNYA (lib/kinerja/tutup-bulan.ts):
--   - Ada baris = bulan itu tertutup; membuka = menghapus barisnya. Jejaknya di audit
--     (KINERJA_TUTUP_BULAN / KINERJA_BUKA_BULAN), tidak di sini.
--   - Berurutan: bulan n hanya bisa ditutup kalau 1..n-1 sudah; yang bisa dibuka hanya
--     bulan tertutup terakhir — angka "s/d bulan" menjumlah bulan-bulan sebelumnya.
--   - Per (tahun, sumber), BUKAN per versi SSK: realisasinya memang tidak berversi.
--   - PRIMARY KEY yang menolak tutup ganda (L69-a), bukan SELECT-dulu.
--
-- Pagarnya di saveRealisasiBatch (409 BULAN_TERTUTUP, tidak bisa ditembus force),
-- di bawah gembok yang sama dengan Tutup/Buka.
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: tanpa tabel ini GET
-- dan Simpan Realisasi gagal.
--
-- Referensi: docs/CONCEPT-kinerja-simpan-realisasi.md §5

CREATE TABLE IF NOT EXISTS kinerja_bulan_tutup (
  tahun         VARCHAR(10)  NOT NULL COMMENT 'Ikut kinerja_* — VARCHAR, bukan SMALLINT',
  sumber        ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS',
                     'OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  bulan         TINYINT      NOT NULL COMMENT '1=Jan, 12=Des',
  ditutup_oleh  INT              NULL,
  ditutup_pada  DATETIME     NOT NULL COMMENT 'WIB, distempel server',
  PRIMARY KEY (tahun, sumber, bulan),
  CONSTRAINT fk_kbt_user FOREIGN KEY (ditutup_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bulan realisasi E-Anggaran yang sudah ditutup — angkanya tidak bisa diubah Simpan';
