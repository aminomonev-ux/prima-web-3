-- migration-notif-recipient-peran.sql — 2026-09-16
--
-- Membetulkan baris `notifications` yang alamatnya NAMA PERAN, bukan token antrean.
--
-- Sebabnya dua panggilan `addNotif` yang menaruh nama peran telanjang di kolom
-- `recipient`. `buildNotifRecipients` tidak pernah memulangkan bentuk itu — untuk
-- SUPER_ADMIN ia memulangkan `__SUPER_ADMIN__`, untuk Bidang `__BIDANG__<peran>` —
-- sedangkan `GET /api/notifications` menyaring `WHERE recipient IN (<daftar itu>)`.
-- Jadi barisnya masuk tanpa galat lalu duduk selamanya: tidak pernah terbaca, tidak
-- pernah terhitung di lencana, dan tidak pernah bisa dihapus lewat layar. Satu-satunya
-- cara melihatnya adalah membuka tabelnya.
--
-- Yang paling merugikan: `BRUTE_FORCE` — peringatan "akun dikunci setelah 5x gagal
-- login dari IP x". Kejadiannya nyata, peringatannya ditulis, dan tak seorang pun
-- pernah bisa melihatnya. PANDUAN §Gejala malah menjanjikan sebaliknya.
--
-- Kodenya sudah dibetulkan di commit yang sama; berkas ini untuk baris yang TERLANJUR
-- tertulis. Aman dijalankan berkali-kali (idempoten: sesudah lari sekali, tidak ada
-- lagi baris yang cocok). Tidak menghapus apa pun — hanya memindahkan alamatnya,
-- sehingga notifikasinya akhirnya sampai, dengan status dibaca apa adanya.
--
-- Periksa dulu apa yang akan tersentuh:
--
--   SELECT recipient, type, COUNT(*) n, MIN(created_at) terlama
--     FROM notifications
--    WHERE recipient IN ('SUPER_ADMIN','ADMIN','ADMIN_KASUBAG','ADMIN_KABAG')
--       OR recipient LIKE 'BIDANG\_%'
--    GROUP BY recipient, type;

UPDATE notifications SET recipient = '__SUPER_ADMIN__' WHERE recipient = 'SUPER_ADMIN';
UPDATE notifications SET recipient = '__ADMIN__'       WHERE recipient = 'ADMIN';
UPDATE notifications SET recipient = '__KASUBAG__'     WHERE recipient = 'ADMIN_KASUBAG';
UPDATE notifications SET recipient = '__KABAG__'       WHERE recipient = 'ADMIN_KABAG';

-- Bidang: `__BIDANG__` + nama peran. Garis bawah di `BIDANG\_%` di-escape supaya ia
-- huruf harfiah, bukan jokernya LIKE — tanpa itu polanya ikut menjaring nama lain.
UPDATE notifications
   SET recipient = CONCAT('__BIDANG__', recipient)
 WHERE recipient LIKE 'BIDANG\_%';
