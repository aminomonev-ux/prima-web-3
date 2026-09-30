-- migration-drop-notif-dibaca.sql — 2026-09-29 (audit sistem, B7, langkah 2)
--
-- Buang kolom `notifications.dibaca` beserta dua indeks yang memuatnya.
--
-- JALANKAN SESUDAH `migration-notifikasi-dibaca.sql` DAN sesudah kode barunya berjalan.
-- Kode baru membaca status baca dari `notifikasi_dibaca` (satu baris per orang) dan tidak
-- lagi menyentuh kolom ini sama sekali — GET/PATCH `/api/notifications`, PATCH
-- `/api/notifications/[id]`, dan cron `purge-retention`. Penulisnya (`addNotif`,
-- `addNotifBulk`) sejak awal tidak pernah menyebutnya (memakai DEFAULT 0).
--
-- Kenapa dibuang, bukan dibiarkan: dua sumber kebenaran untuk satu fakta ("sudah dibaca
-- belum") cepat atau lambat berbeda pendapat — pola `migration-drop-is-latest.sql`.
-- Dua indeks ikut dibuang supaya tidak tersisa indeks yang namanya berbohong tentang
-- isinya; penggantinya `idx_notif_recipient_waktu (recipient, created_at)`.

ALTER TABLE notifications
  DROP INDEX idx_notif_recipient,
  DROP INDEX idx_notif_recipient_full,
  DROP COLUMN dibaca;
