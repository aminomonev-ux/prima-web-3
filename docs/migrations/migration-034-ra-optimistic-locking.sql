-- Migration 034: optimistic locking untuk rencana_aksi (prevent lost-update di concurrent multi-user edit)
-- Skenario: User A & B sama-sama buka indikator X (target=5). A simpan jadi 10. B (state lama=5) simpan jadi 20.
-- Tanpa lock: B menimpa A tanpa warning. Dengan version check: UPDATE WHERE id=? AND version=? -> 0 row -> server return 409 Conflict.
-- Client auto-reload data terbaru, user edit ulang dengan baseline fresh.

ALTER TABLE rencana_aksi
  ADD COLUMN version INT NOT NULL DEFAULT 0;
