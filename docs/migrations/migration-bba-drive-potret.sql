-- BBA — perubahan laporan di Google Drive dibawa balik ke PRIMA (docs/konsep/bba/CONCEPT-bba-drive-balik.md §6A).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang: cron salinan Drive menulis potret tiap kiriman ke tabel ini,
-- dan tinjauan perubahan Drive membacanya. Tanpa data awal (tabel baru kosong); kiriman pertama sesudah kode terpasang
-- mengisinya.
--
-- Potret = isi kolom yang bisa dibawa balik (bentuk baku, per lembar, per id) dari SATU kiriman PRIMA ke Drive. Dipakai
-- sebagai "asal" gabung tiga arah: apa yang dibuka pengubah di Drive, dibanding isi berkas sesudah ia menyimpan dan isi
-- PRIMA sekarang. Bukan berkas Excel-nya. Tidak dirujuk tabel lain; dipangkas aplikasi (≤ 20 per berkas, sesudah
-- tinjauan selesai tinggal yang terbaru).

CREATE TABLE bba_drive_potret (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kunci        VARCHAR(40)  NOT NULL COMMENT 'Kunci berkas laporan, mis. rencana:2026',
  md5          CHAR(32)     NOT NULL COMMENT 'md5Checksum isi berkas yang diunggah (jawaban Drive)',
  revisi       VARCHAR(255) NULL     COMMENT 'headRevisionId hasil unggahan',
  dikirim_pada DATETIME     NOT NULL,
  isi          JSON         NOT NULL COMMENT 'Potret bentuk baku: lembar → id → kolom → nilai (lib/bba/drive-balik.ts)',
  PRIMARY KEY (id),
  KEY idx_bdp_kunci (kunci, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='BBA — potret tiap kiriman laporan ke Drive (asal gabung tiga arah)';
