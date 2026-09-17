-- Migration: pk_sasaran — tiga kolom sasaran disamakan lebarnya dengan sumbernya
--
-- SEBAB. Tombol "Import Renaksi" di Master Sasaran menyalin `rencana_aksi.outcome_*`
-- ke `pk_sasaran.program/kegiatan/subkegiatan`. Sumbernya VARCHAR(500), tujuannya
-- VARCHAR(255). Kolom indikator sudah sepasang (500 ↔ 500) sejak awal; tiga kolom ini
-- terlewat. Akibatnya impor menghasilkan baris yang MUSTAHIL disimpan: pratinjaunya
-- tampil normal, lalu Simpan ditolak 400 "expected string to have <=255 characters"
-- tanpa menyebut baris maupun kolomnya.
--
-- Nyata, bukan teoretis: pada data 2026 ada 1 baris `outcome_sub_kegiatan` sepanjang
-- 300 karakter ("Tersedianya Rumah sakit yang ditingkatkan sarana, prasarana, alat
-- kesehatan dan SDM agar sesuai standar jenis pelayanan ..."), dan satu baris itu
-- cukup untuk menggagalkan seluruh batch 117 baris.
--
-- AMAN dijalankan kapan saja: hanya MELEBARKAN kolom, jadi tidak ada data yang bisa
-- terpotong. Kolom target TIDAK ikut — isinya "765 Orang", 255 jauh lebih dari cukup,
-- dan melebarkan yang tidak perlu cuma menyembunyikan isian yang sebenarnya salah.
--
-- Indeks `idx_pk_sasaran_program` TIDAK perlu disentuh: ia indeks AWALAN
-- (program(100), kegiatan(50), subkegiatan(50)) yang tidak bergantung lebar kolom.

ALTER TABLE pk_sasaran
  MODIFY program     VARCHAR(500) NOT NULL,
  MODIFY kegiatan    VARCHAR(500),
  MODIFY subkegiatan VARCHAR(500);

-- Periksa hasilnya:
--   SHOW COLUMNS FROM pk_sasaran WHERE Field IN ('program','kegiatan','subkegiatan');
