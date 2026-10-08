-- migration-blud-dpa-perubahan.sql
-- DPA Perubahan BLUD — konsep: docs/CONCEPT-blud-dpa-perubahan.md (§4, §6)
--
-- Perubahan BUKAN tabel baru: versinya ditulis ke `dpa_blud` lewat Simpan biasa,
-- jadi setiap pembaca "DPA mana yang berlaku" otomatis ikut membacanya (§3).
-- Yang baru cuma dua hal:
--
-- 1. Empat kolom Sebelum di `dpa_blud`. MILIK SERVER: diisi dari versi dasar
--    (`sumber_dasar` + `versi_dasar` di tabel penanda) pada SETIAP Simpan di babak
--    Perubahan, dicocokkan lewat `anggaran_key`. Isian dari layar/berkas diabaikan.
--    NULL = baris DPA murni, atau baris yang lahir di Perubahan (tampil "—").
--    Bertambah/(Berkurang) TIDAK disimpan — dihitung saat tampil (preseden L86).
--
-- 2. Tabel penanda `blud_dpa_perubahan`, pola `blud_pergeseran_tutup`. Versi DPA
--    bertanggal >= `versi_mulai` adalah versi Perubahan; nomor "ke-n" dihitung dari
--    urutan baris, tidak disimpan (L55). PRIMARY KEY yang menolak pembuatan ganda,
--    bukan SELECT-dulu (L69-a). Penanda ikut dibuang begitu tidak tersisa satu pun
--    versi DPA >= `versi_mulai` — di transaksi hapus yang sama.
--
-- Aman dijalankan sebelum kodenya dipasang: kolom NULL-able tanpa default yang
-- mengubah arti baris lama, dan tabel kosong = aturan pagu lama persis (§8).
-- WAJIB juga dijalankan di server kantor sebelum kode Tahap 1 dipasang di sana.

ALTER TABLE dpa_blud
  ADD COLUMN vol_sebelum    DECIMAL(18,4) NULL COMMENT 'Perubahan: vol versi dasar (milik server, NULL = murni/baris baru)' AFTER usulan_no,
  ADD COLUMN satuan_sebelum VARCHAR(32)   NULL COMMENT 'Perubahan: satuan versi dasar' AFTER vol_sebelum,
  ADD COLUMN harga_sebelum  DECIMAL(18,2) NULL COMMENT 'Perubahan: harga versi dasar' AFTER satuan_sebelum,
  ADD COLUMN jumlah_sebelum DECIMAL(18,2) NULL COMMENT 'Perubahan: jumlah versi dasar' AFTER harga_sebelum;

CREATE TABLE IF NOT EXISTS blud_dpa_perubahan (
  tahun_anggaran SMALLINT UNSIGNED NOT NULL,
  versi_mulai    DATE     NOT NULL COMMENT 'Versi DPA pertama yang berstatus Perubahan',
  sumber_dasar   ENUM('PERGESERAN','DPA') NOT NULL COMMENT 'Tabel asal angka dasar — DPA hanya kalau tahun itu belum punya pergeseran',
  versi_dasar    DATE     NOT NULL COMMENT 'Versi yang diambil — sumber kolom Sebelum',
  -- Jam WIB dari `waktuSekarangWIB()`, bukan NOW() MySQL — alasan yang sama dengan
  -- blud_pergeseran_tutup.ditutup_pada.
  dibuat_pada    DATETIME NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  dibuat_oleh    INT          NULL,
  catatan        TEXT         NULL COMMENT 'Opsional: nomor/tanggal penetapan untuk kop cetak',
  PRIMARY KEY (tahun_anggaran, versi_mulai),
  CONSTRAINT fk_bdp_user FOREIGN KEY (dibuat_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BLUD - Penanda DPA Perubahan (versi DPA >= versi_mulai = Perubahan)';
