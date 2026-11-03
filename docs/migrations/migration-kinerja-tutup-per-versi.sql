-- migration-kinerja-tutup-per-versi.sql
-- Tutup Bulan Realisasi per VERSI RKO + foto realisasi versi yang final.
--
-- MASALAH: tutupan menempel pada (tahun, sumber, bulan), padahal Murni dan Perubahan memandang
-- angka realisasi yang SAMA (realisasi satu set per sumber; versi hanya memilih pagu/target).
-- Menutup Januari di Perubahan ikut menutup Januari Murni, dan sebaliknya. Dan Murni yang sudah
-- digantikan Perubahan tetap bergeser angkanya setiap realisasi disunting.
--
-- ATURANNYA (lib/kinerja/tutup-bulan.ts, foto-realisasi.ts):
--   - Tutupan menempel pada (tahun, sumber, versi, bulan). Tutup/Buka hanya di versi terbaru.
--   - "Buat Perubahan" memotret realisasi untuk versi yang dikunci. Versi final membaca foto
--     itu dan 12 bulannya tertutup (diturunkan dari locked_at, bukan 12 baris di sini).
--     Perubahan mulai dengan semua bulan terbuka.
--   - Foto permanen; hilang hanya kalau versinya dihapus Reset, atau kuncinya dibuka lagi
--     karena Perubahannya dihapus.
--
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: kode baru menulis & membaca
-- kolom versi tabel tutupan dan kedua tabel foto. Jalankan SEKALI.
--
-- Penanda /*UJI*/ dipakai scripts/test-kinerja-tutup-per-versi.mts untuk membatasi langkah
-- 2 dan 5 ke tahun kotak pasir; di server kantor penanda itu hanya komentar.
--
-- Referensi: docs/CONCEPT-kinerja-tutup-per-versi.md

-- 1. Kolom versi pada tutupan.
ALTER TABLE kinerja_bulan_tutup
  ADD COLUMN versi_tipe ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI'
    COMMENT 'Versi RKO pemilik tutupan ini' AFTER sumber,
  ADD COLUMN versi_seq  TINYINT NOT NULL DEFAULT 0 AFTER versi_tipe;

-- 2. Tutupan lama → versi TERBARU tiap sumber (aturan pickVersiAktif: PERUBAHAN ber-seq
--    tertinggi, kalau tidak ada MURNI). Itulah yang selama ini dijaganya: realisasi berjalan.
--    Tampilan sesudah pembaruan sama dengan sebelumnya.
UPDATE kinerja_bulan_tutup t
JOIN (
  SELECT tahun, sumber,
         IF(SUM(versi_tipe = 'PERUBAHAN') > 0, 'PERUBAHAN', 'MURNI') AS vt,
         IF(SUM(versi_tipe = 'PERUBAHAN') > 0, MAX(IF(versi_tipe = 'PERUBAHAN', versi_seq, NULL)), MAX(versi_seq)) AS vs
  FROM kinerja_ssk
  WHERE tahun IN (SELECT tahun FROM kinerja_bulan_tutup) /*UJI*/
  GROUP BY tahun, sumber
) v ON v.tahun = t.tahun AND v.sumber = t.sumber
SET t.versi_tipe = v.vt, t.versi_seq = v.vs;

ALTER TABLE kinerja_bulan_tutup
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (tahun, sumber, versi_tipe, versi_seq, bulan);

-- 3. Foto realisasi versi final — kepala (ada baris = versi itu sudah dipotret, walau isinya nol).
CREATE TABLE IF NOT EXISTS kinerja_realisasi_foto (
  tahun         VARCHAR(10)  NOT NULL COMMENT 'Ikut kinerja_* — VARCHAR, bukan SMALLINT',
  sumber        ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS',
                     'OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  versi_tipe    ENUM('MURNI','PERUBAHAN') NOT NULL COMMENT 'Versi RKO yang final',
  versi_seq     TINYINT      NOT NULL,
  asal          ENUM('BUAT_PERUBAHAN','RIWAYAT','BERJALAN') NOT NULL
                COMMENT 'BUAT_PERUBAHAN = dipotret saat tombolnya ditekan; RIWAYAT/BERJALAN = dipotret saat migrasi',
  keadaan_pada  DATETIME     NOT NULL COMMENT 'WIB — angka foto = realisasi pada jam ini',
  riwayat_id    BIGINT UNSIGNED NULL COMMENT 'asal RIWAYAT: kinerja_riwayat_simpan.id (soft-FK, riwayat bisa terpangkas)',
  difoto_oleh   INT              NULL,
  difoto_pada   DATETIME     NOT NULL,
  PRIMARY KEY (tahun, sumber, versi_tipe, versi_seq),
  CONSTRAINT fk_krf_user FOREIGN KEY (difoto_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Foto realisasi versi RKO yang final (Perubahan berikutnya sudah dibuat) — acuan laporannya';

CREATE TABLE IF NOT EXISTS kinerja_realisasi_foto_baris (
  id                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun             VARCHAR(10)   NOT NULL,
  sumber            ENUM('GAJI','BLUD','HARLEP','PROMKES','SARPRAS',
                         'OBAT','PEMELIHARAAN','PEMBANGUNAN') NOT NULL,
  versi_tipe        ENUM('MURNI','PERUBAHAN') NOT NULL,
  versi_seq         TINYINT       NOT NULL,
  bulan             TINYINT       NOT NULL COMMENT '1=Jan, 12=Des',
  ssk_canonical_id  VARCHAR(20)   NOT NULL DEFAULT '',
  ssk_versi_tipe    ENUM('MURNI','PERUBAHAN') NOT NULL DEFAULT 'MURNI',
  ssk_versi_seq     TINYINT       NOT NULL DEFAULT 0,
  keterangan        VARCHAR(500)  NOT NULL DEFAULT '',
  program           VARCHAR(255)  DEFAULT NULL,
  kegiatan          VARCHAR(255)  DEFAULT NULL,
  subkegiatan       VARCHAR(255)  DEFAULT NULL,
  uraian_ssk        VARCHAR(255)  DEFAULT NULL,
  real_fisik        DECIMAL(18,2) NOT NULL DEFAULT 0,
  real_keuangan     DECIMAL(18,2) NOT NULL DEFAULT 0,
  INDEX idx_krfb_versi (tahun, sumber, versi_tipe, versi_seq, bulan),
  CONSTRAINT fk_krfb_foto FOREIGN KEY (tahun, sumber, versi_tipe, versi_seq)
    REFERENCES kinerja_realisasi_foto (tahun, sumber, versi_tipe, versi_seq) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Baris foto realisasi — bentuk sama dengan kinerja_realisasi';

-- 4. Versi yang SUDAH terkunci sebelum pembaruan ini belum punya foto. Sumbernya simpanan
--    realisasi terakhir sebelum Perubahan dibuat (kinerja_riwayat_simpan, maks 50 simpanan
--    terakhir per sumber), karena itu yang paling dekat dengan keadaan saat itu.
--    locked_at (NOW() MySQL) dibandingkan dengan disimpan_pada (WIB): zona waktu sesi MySQL
--    server kantor WIB, jadi keduanya sejajar.
INSERT INTO kinerja_realisasi_foto
  (tahun, sumber, versi_tipe, versi_seq, asal, keadaan_pada, riwayat_id, difoto_oleh, difoto_pada)
SELECT v.tahun, v.sumber, v.versi_tipe, v.versi_seq, 'RIWAYAT', r.disimpan_pada, r.id, NULL, NOW()
FROM (
  SELECT tahun, sumber, versi_tipe, versi_seq, MIN(locked_at) AS dikunci
  FROM kinerja_ssk
  WHERE locked_at IS NOT NULL /*UJI*/
  GROUP BY tahun, sumber, versi_tipe, versi_seq
) v
JOIN kinerja_riwayat_simpan r ON r.id = (
  SELECT r2.id FROM kinerja_riwayat_simpan r2
  WHERE r2.jenis = 'REALISASI' AND r2.tahun = v.tahun AND r2.sumber = v.sumber AND r2.disimpan_pada <= v.dikunci
  ORDER BY r2.disimpan_pada DESC, r2.id DESC
  LIMIT 1
)
WHERE NOT EXISTS (
  SELECT 1 FROM kinerja_realisasi_foto f
  WHERE f.tahun = v.tahun AND f.sumber = v.sumber AND f.versi_tipe = v.versi_tipe AND f.versi_seq = v.versi_seq
);

INSERT INTO kinerja_realisasi_foto_baris
  (tahun, sumber, versi_tipe, versi_seq, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq,
   keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan)
SELECT f.tahun, f.sumber, f.versi_tipe, f.versi_seq, j.bulan, COALESCE(j.cid, ''),
       IF(j.svt = 'PERUBAHAN', 'PERUBAHAN', 'MURNI'), COALESCE(j.svs, 0),
       COALESCE(j.ket, ''), j.program, j.kegiatan, j.subkegiatan, j.uraian_ssk,
       COALESCE(j.fisik, 0), COALESCE(j.keu, 0)
FROM kinerja_realisasi_foto f
JOIN kinerja_riwayat_simpan r ON r.id = f.riwayat_id
CROSS JOIN JSON_TABLE(r.isi, '$[*]' COLUMNS (
  urut        FOR ORDINALITY,
  bulan       TINYINT       PATH '$.bulan',
  cid         VARCHAR(20)   PATH '$.ssk_canonical_id',
  svt         VARCHAR(10)   PATH '$.ssk_versi_tipe',
  svs         TINYINT       PATH '$.ssk_versi_seq',
  ket         VARCHAR(500)  PATH '$.keterangan',
  program     VARCHAR(255)  PATH '$.program',
  kegiatan    VARCHAR(255)  PATH '$.kegiatan',
  subkegiatan VARCHAR(255)  PATH '$.subkegiatan',
  uraian_ssk  VARCHAR(255)  PATH '$.uraian_ssk',
  fisik       DECIMAL(18,2) PATH '$.real_fisik',
  keu         DECIMAL(18,2) PATH '$.real_keuangan'
)) j
WHERE f.asal = 'RIWAYAT' AND j.bulan BETWEEN 1 AND 12
  AND NOT EXISTS (
    SELECT 1 FROM kinerja_realisasi_foto_baris b
    WHERE b.tahun = f.tahun AND b.sumber = f.sumber AND b.versi_tipe = f.versi_tipe AND b.versi_seq = f.versi_seq
  )
ORDER BY f.tahun, f.sumber, f.versi_tipe, f.versi_seq, j.bulan, j.urut;

-- 5. Simpanan sebelum Perubahan sudah terpangkas retensi → foto dari realisasi saat ini.
--    Layar menyebut asal ini apa adanya.
INSERT INTO kinerja_realisasi_foto
  (tahun, sumber, versi_tipe, versi_seq, asal, keadaan_pada, riwayat_id, difoto_oleh, difoto_pada)
SELECT v.tahun, v.sumber, v.versi_tipe, v.versi_seq, 'BERJALAN', NOW(), NULL, NULL, NOW()
FROM (
  SELECT tahun, sumber, versi_tipe, versi_seq
  FROM kinerja_ssk
  WHERE locked_at IS NOT NULL /*UJI*/
  GROUP BY tahun, sumber, versi_tipe, versi_seq
) v
WHERE NOT EXISTS (
  SELECT 1 FROM kinerja_realisasi_foto f
  WHERE f.tahun = v.tahun AND f.sumber = v.sumber AND f.versi_tipe = v.versi_tipe AND f.versi_seq = v.versi_seq
);

INSERT INTO kinerja_realisasi_foto_baris
  (tahun, sumber, versi_tipe, versi_seq, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq,
   keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan)
SELECT f.tahun, f.sumber, f.versi_tipe, f.versi_seq, r.bulan, r.ssk_canonical_id, r.ssk_versi_tipe, r.ssk_versi_seq,
       r.keterangan, r.program, r.kegiatan, r.subkegiatan, r.uraian_ssk, r.real_fisik, r.real_keuangan
FROM kinerja_realisasi_foto f
JOIN kinerja_realisasi r ON r.tahun = f.tahun AND r.sumber = f.sumber
WHERE f.asal = 'BERJALAN'
  AND NOT EXISTS (
    SELECT 1 FROM kinerja_realisasi_foto_baris b
    WHERE b.tahun = f.tahun AND b.sumber = f.sumber AND b.versi_tipe = f.versi_tipe AND b.versi_seq = f.versi_seq
  )
ORDER BY f.tahun, f.sumber, f.versi_tipe, f.versi_seq, r.bulan, r.id;
