-- migration-notifikasi-dibaca.sql — 2026-09-29 (audit sistem, B7)
--
-- Tanda "sudah dibaca" notifikasi pindah dari SATU kolom per baris
-- (`notifications.dibaca`) ke SATU baris per orang (`notifikasi_dibaca`).
--
-- Sebabnya: notifikasi alur Usulan dialamatkan ke ANTREAN (`__ADMIN__`, `__KASUBAG__`,
-- `__KABAG__`, `__BIDANG__<peran>`), dan satu kolom `dibaca` berarti membaca = membacakan
-- untuk semua pemegang antrean itu. Paling nyata: penerima SUPER_ADMIN mencakup
-- `__KASUBAG__` dan `__KABAG__`, jadi Super Admin yang menekan "Tandai semua dibaca"
-- ikut memadamkan peringatan "Menunggu Kasubag/Kabag" di akun Kasubag & Kabag. Enam
-- akun ADMIN dan tiga akun tiap BIDANG juga saling memadamkan.
--
-- Notifikasinya TETAP satu baris per peristiwa — antrean tetap antrean, orang yang
-- besok masuk peran itu tetap melihatnya. Yang dipindah ke per-orang cuma status bacanya.
--
-- URUTAN PEMASANGAN: jalankan berkas ini SEBELUM kode barunya naik — kode baru membaca
-- tabel `notifikasi_dibaca`, dan tanpa tabelnya bel notifikasi menjawab 500. Kolom lama
-- `notifications.dibaca` dibuang TERPISAH (`migration-drop-notif-dibaca.sql`) sesudah
-- kode baru berjalan, pola `migration-drop-is-latest.sql`.
--
-- Dijalankan ulang: CREATE TABLE memakai IF NOT EXISTS dan backfill memakai INSERT IGNORE
-- di atas PRIMARY KEY (notif_id, user_id). CREATE INDEX akan menjawab ER_DUP_KEYNAME
-- (1061) kalau indeksnya sudah ada — aman diabaikan.

CREATE TABLE IF NOT EXISTS notifikasi_dibaca (
  notif_id     INT       NOT NULL,
  user_id      INT       NOT NULL,
  dibaca_pada  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notif_id, user_id),
  INDEX idx_nd_user (user_id),
  CONSTRAINT fk_nd_notif FOREIGN KEY (notif_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_nd_user  FOREIGN KEY (user_id)  REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indeks pengganti untuk daftar bel: saring antrean, urut terbaru. Dua indeks lama
-- memuat `dibaca` di tengahnya dan ikut dibuang bersama kolomnya nanti.
CREATE INDEX idx_notif_recipient_waktu ON notifications (recipient, created_at);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Baris yang SUDAH dibaca dianggap dibaca oleh SEMUA pembaca antreannya hari ini.
-- Tanpa ini tiap admin mendadak disambut notifikasi lama sebagai "baru". Baris yang
-- belum dibaca (`dibaca = 0`) dibiarkan — memang belum dibaca siapa pun.
--
-- Pembaca tiap alamat = `buildNotifRecipients` (lib/services/notifications.ts):
--   username             → orang itu sendiri
--   __ADMIN__            → ADMIN, SUPER_ADMIN
--   __KASUBAG__          → ADMIN_KASUBAG, SUPER_ADMIN
--   __KABAG__            → ADMIN_KABAG, SUPER_ADMIN
--   __SUPER_ADMIN__      → SUPER_ADMIN
--   __BIDANG__<peran>    → pemegang peran itu

INSERT IGNORE INTO notifikasi_dibaca (notif_id, user_id)
SELECT n.id, u.id
  FROM notifications n
  JOIN users u
    ON u.username = n.recipient
    OR (n.recipient = '__ADMIN__'       AND u.role IN ('ADMIN', 'SUPER_ADMIN'))
    OR (n.recipient = '__KASUBAG__'     AND u.role IN ('ADMIN_KASUBAG', 'SUPER_ADMIN'))
    OR (n.recipient = '__KABAG__'       AND u.role IN ('ADMIN_KABAG', 'SUPER_ADMIN'))
    OR (n.recipient = '__SUPER_ADMIN__' AND u.role = 'SUPER_ADMIN')
    OR (n.recipient = CONCAT('__BIDANG__', u.role))
 WHERE n.dibaca = 1;

-- Periksa sesudahnya (angka kedua ≥ angka pertama; lebih besar kalau antrean dibaca banyak orang):
--   SELECT (SELECT COUNT(*) FROM notifications WHERE dibaca = 1) AS baris_dibaca_lama,
--          (SELECT COUNT(DISTINCT notif_id) FROM notifikasi_dibaca) AS baris_dibaca_baru;
