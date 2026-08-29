-- migration-blud-pergeseran-tutup.sql
-- Tutup Pergeseran — konsep: docs/CONCEPT-blud-tutup-pergeseran.md
--
-- Menutup satu PUTARAN pergeseran: kolom P disalin ke kolom kiri, sehingga
-- geseran berikutnya dihitung terhadap hasil putaran ini, bukan terhadap DPA
-- murni. Barisnya sendiri ditulis lewat jalur Simpan yang sudah ada; tabel ini
-- hanya mencatat PERISTIWA penutupannya.
--
-- PRIMARY KEY (tahun_anggaran, versi_ditutup) itu pengamannya, bukan hiasan:
-- satu versi hanya bisa ditutup sekali, dan klik dobel ditolak kunci tabel —
-- atomik, tanpa `SELECT … FOR UPDATE` pada baris yang belum ada (L69-a).
--
-- Nomor putaran (ke-1, ke-2) SENGAJA tidak disimpan; dihitung saat dibaca dari
-- urutan `versi_ditutup`. Menyimpannya berarti hitung-lalu-tulis (L55).

CREATE TABLE IF NOT EXISTS blud_pergeseran_tutup (
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  versi_ditutup  DATE     NOT NULL COMMENT 'Versi pergeseran yang dikunci',
  versi_basis    DATE     NOT NULL COMMENT 'Versi yang lahir dari penutupan',
  -- Jam WIB dari `waktuSekarangWIB()`, BUKAN NOW() MySQL: `versi_tanggal` datang
  -- dari klien lewat `tanggalHariIniWIB()`, dan pada dini hari WIB keduanya bisa
  -- beda tanggal kalau server berjalan di UTC. Alasan yang sama dengan
  -- blud_riwayat_simpan.disimpan_pada.
  ditutup_pada   DATETIME NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  ditutup_oleh   INT          NULL,
  catatan        TEXT         NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tahun_anggaran, versi_ditutup),
  INDEX idx_bpt_basis (tahun_anggaran, versi_basis),
  CONSTRAINT fk_bpt_user FOREIGN KEY (ditutup_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Penutupan putaran pergeseran (hasil putaran jadi patokan berikutnya)';
