-- ═══ PRIMA — LKJIP — Blok GRAFIK (pie/bar/line) ════════════════════
-- Menambah nilai 'GRAFIK' ke enum lkjip_block.tipe.
-- Grafik dibuat di editor (recharts) → PNG (html2canvas-pro) → embed ke Word
-- via pipeline gambar (payload.imageFileId = Drive fileId). MySQL 8.
ALTER TABLE lkjip_block
  MODIFY COLUMN tipe ENUM('NARASI','TABEL','GAMBAR','GRAFIK') NOT NULL;
