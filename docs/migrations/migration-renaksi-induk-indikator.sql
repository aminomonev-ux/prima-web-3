-- migration-renaksi-induk-indikator.sql
-- Tautan baris Renaksi ke baris indikator INDUK yang dijabarkannya.
-- Konsep: docs/CONCEPT-renaksi-pilih-indikator.md (§3, §6, §12 Tahap 1).
--
-- KENAPA: Data Entry menyusun hierarki lewat TEKS NAMA, dan tiap baris hanya menyimpan nama
-- induknya — tidak ada yang mencatat "baris ini penjabaran indikator induk yang mana". Akibatnya
-- pilihan "program → indikator program → kegiatan yang sesuai" tidak bisa dihitung: semua kegiatan
-- di bawah program itu selalu muncul, berapa pun indikator yang dipilih.
--
-- Kolom ini menunjuk ID baris, bukan teks indikator:
--   • ganti nama entitas (T16/H) menulis ulang nama seluruh turunan, id tidak ikut bergeser;
--   • satu entitas bisa punya beberapa indikator bertekst mirip, teks tidak cukup membedakan.
-- Tautan hanya SATU TINGKAT (sub → kegiatan → program → sasaran → tujuan dinaiki berulang).
-- Soft-FK: tanpa FOREIGN KEY, keberadaan induk diperiksa di jalur tulis (L68).
--
-- NULL = belum diisi. 47 baris tahun 2026 + 5 baris tahun 2040 SENGAJA dibiarkan kosong:
-- backfill otomatis berarti menebak (satu program punya sampai 4 indikator), dan salah tautan
-- tidak kelihatan. Tautan terisi saat baris itu disunting lewat Data Entry.
--
-- Kolom ini TIDAK masuk kunci unik mana pun. `uk_tahun_level_ind (tahun, level, indikator)` tetap.
--
-- WAJIB dijalankan di server kantor SEBELUM kode tahap 2 dipasang.

ALTER TABLE rencana_aksi
  ADD COLUMN induk_indikator_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Soft-FK rencana_aksi.id — baris indikator induk yang dijabarkan (NULL = belum diisi, data lama)'
    AFTER bulan_realisasi,
  ADD INDEX idx_ra_induk_indikator (tahun, induk_indikator_id);
