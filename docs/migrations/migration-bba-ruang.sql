-- BBA Tahap C — ruangan berada di gedung mana + data kop KIR (docs/CONCEPT-bba-buku-aset.md §15).
-- WAJIB dijalankan di server kantor SEBELUM kodenya dipasang, SESUDAH migration-bba-aset.sql:
-- Master Ruangan, opname per gedung, dan KIR membaca kolom-kolom ini.
--
-- gedung_aset_id = soft-FK ke bba_aset (diperiksa aplikasi): FK sungguhan membuat bba_lokasi & bba_aset
-- saling bergantung.
--
-- Pendataan eksisting Tahap 3 (bba_eksisting) dipensiunkan di tahap ini: layar & API-nya dibuang,
-- digantikan kondisi per register di bba_aset. Tabelnya SENGAJA tidak di-DROP — bila di server kantor
-- sudah ada isinya, datanya tetap ada untuk dibaca/dipindahkan manual. Periksa dulu:
--   SELECT COUNT(*) FROM bba_eksisting;   -- 0 = aman di-DROP kapan saja

ALTER TABLE bba_lokasi
  ADD COLUMN gedung_aset_id BIGINT UNSIGNED NULL COMMENT 'Gedung (bba_aset golongan C) tempat ruangan ini — Kode Gedung di kop KIR',
  ADD COLUMN luas           DECIMAL(10,2)  NULL COMMENT 'Luas ruangan (m²) — kop KIR',
  ADD COLUMN pj_nama        VARCHAR(120)   NULL COMMENT 'Penanggung Jawab Ruangan — tanda tangan KIR',
  ADD COLUMN pj_nip         VARCHAR(40)    NULL,
  ADD KEY idx_bba_lokasi_gedung (gedung_aset_id);
