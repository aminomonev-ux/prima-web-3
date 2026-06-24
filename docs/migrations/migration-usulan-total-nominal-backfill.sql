-- Backfill: koreksi usulan_headers.total_nominal = "Total Disetujui" final.
-- Sebelumnya updateHeaderStats menjumlah nominal_disetujui SEMUA item (tanpa filter
-- status), padahal nominal_disetujui keisi sejak telaah Admin → total_nominal salah
-- ke-isi dini untuk usulan yang belum final. Setelah fix di lib/data/usulan.ts,
-- baris baru benar otomatis; jalankan query ini sekali untuk koreksi data lama.
-- Aman diulang (idempotent).

UPDATE usulan_headers h
SET h.total_nominal = (
  SELECT COALESCE(SUM(i.nominal_disetujui), 0)
  FROM usulan_items i
  WHERE i.usulan_id = h.id AND i.status = 'DISETUJUI'
);
