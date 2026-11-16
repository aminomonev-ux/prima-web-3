# Konsep — Defender PRIMA (deteksi & respons serangan)

> Status: **KONSEP SAJA, belum ada kode, belum ada tabel.** Dokumen ini sengaja ditulis
> lebih dulu supaya ambang, pagar, dan teks pesannya disepakati sebelum satu baris pun
> ditulis. Skema di §5 masih usulan; kalau disetujui, ia wajib masuk
> `docs/schema-mysql.sql` + `docs/migrations/migration-defender-*.sql` pada saat
> dikerjakan (bukan sebelumnya).

## 0. Kedudukan dokumen ini

PRIMA sudah punya banyak bahan keamanan: sakelar modul tiga keadaan, mode beku global,
audit trail, broadcast, rate limit, lockout akun. Yang belum ada adalah **yang
menyambung semuanya**: sesuatu yang mengenali pola serangan, memberi tahu SUPER_ADMIN
saat itu juga, dan menyediakan satu tombol yang aman untuk menghentikan kerusakan tanpa
mematikan pekerjaan orang lain.

Dokumen ini menjawab empat pertanyaan: apa yang dideteksi, bagaimana caranya tahu, ke
siapa diberitahukan, dan apa yang boleh dilakukan sistem/administrator sebagai respons.

## 1. Masalah

1. **Deteksi hari ini hanya soal login.** `TabAttackMonitor` membaca `audit_log` untuk
   `LOGIN_SUCCESS/FAILED/BLOCKED` selama 24 jam. Serangan yang tidak lewat login —
   pemindaian URL, probing IDOR (`403 "Bukan dokumen Anda"`), pencurian data lewat
   unduhan berulang, perubahan wewenang yang aneh — tidak terlihat sama sekali.
2. **Tidak realtime.** Monitor hanya memuat saat tombol "MUAT ULANG" ditekan. Tidak ada
   satu pun jalur yang mendorong peringatan ke SUPER_ADMIN.
3. **Aksi darurat tersebar dan tidak seragam.** Membekukan tulisan hari ini berarti
   membuka Admin Panel → App Control → ubah satu per satu sakelar modul → lalu broadcast
   manual. Tiga layar, empat keputusan, dan tidak ada catatan "kenapa".
4. **Tidak ada jejak ancaman.** `audit_log` mencatat aksi yang *berhasil* (siapa
   mengubah apa). Ia bukan tempat menyimpan "ada 60 permintaan 404 dari satu sumber
   dalam 2 menit" — dan kalau dipaksa, audit yang tadinya enak dibaca jadi banjir.

## 2. Yang SUDAH ada dan TIDAK dibuat ulang

| Kemampuan | Berkas | Catatan untuk konsep ini |
|---|---|---|
| Sakelar 3 keadaan (`online`/`readonly`/`maintenance`), pesan, tenggat `_sampai` | `lib/security/guard.ts`, `lib/registry/apps.ts`, `app_config` | Mode Aman = `app_status_global = 'readonly'`. Nol kode baru untuk membekukan tulisan |
| Modul dibekukan → 503 `MODUL_BACA_SAJA` dengan kalimat seragam | `balasSakelar` di `guard.ts` | Pesan darurat tidak perlu dibuat ulang; cukup diisi lewat `app_status_*_pesan` |
| Halaman `/maintenance` + pemberitahuan di halaman login | `lib/security/pemeliharaan.ts` | Dipakai apa adanya; tidak perlu layar darurat kedua |
| Broadcast masal + riwayat | `TabBroadcast`, `/api/admin/broadcast` | Tinggal dipanggil dari playbook |
| Lonceng notifikasi (per orang / per antrean peran) | `lib/services/notifications.ts` (`addNotif`, `NOTIF_SUPER_ADMIN`) | Jalur notifikasi in-app yang sudah terbukti |
| Rate limit + lockout akun | `lib/security/ratelimit.ts`, `users.locked_until` | Menjadi sumber sinyal, bukan diganti |
| Audit trail + retensi per jenis | `lib/security/auditlog.ts`, `lib/security/retensi-audit.ts` | Jenis event baru WAJIB digolongkan di `Record<AuditEventType, …>` |
| Admin Panel dengan tab terpisah | `app/(dashboard)/admin/_panels/*` | Tab baru mengikuti pola `_panels` yang ada |
| CSP/nonce, strip header `x-user-*`, penjaga per route | `proxy.ts`, `lib/security/*` | Titik pasang sensor, bukan diganti |

## 3. Prinsip rancangan

1. **Deteksi ≠ audit.** `audit_log` menjawab "siapa melakukan apa"; `security_events`
   menjawab "apa yang dicoba terhadap sistem". Dua tabel, dua retensi, dua pembaca.
2. **Respons bertingkat, bukan sakelar on/off.** Tindakan paling ringan yang bisa
   menghentikan kerusakan dipilih lebih dulu. Mematikan seluruh aplikasi sebagai reaksi
   pertama adalah cara tercepat mengubah kesalahan sendiri menjadi insiden.
3. **Detektor tidak boleh mematikan aplikasi.** Kegagalan evaluator = *fail-open* (hanya
   tidak ada peringatan). Sebaliknya penjagaan tetap *fail-closed* seperti `modulMati`.
   Dua arah yang berbeda ini disengaja: pagar yang salah menutup lebih merugikan daripada
   peringatan yang terlewat.
4. **Aksi darurat harus tercatat dan sulit dipakai sebagai senjata.** Akun SUPER_ADMIN
   yang dibajak tidak boleh bisa memakai "Mode Aman" untuk melumpuhkan kantor tanpa
   jejak dan tanpa lawan.
5. **Jangan berpura-pura.** Pesan darurat menyebut apa yang terjadi ("penulisan dibekukan
   sementara karena pemeriksaan keamanan"), bukan "pemeliharaan rutin". Kebohongan yang
   dipakai berulang membuat orang berhenti membedakan gangguan biasa dari gangguan serius.
6. **Yang tidak bisa diukur jangan diklaim.** Aplikasi tidak bisa menahan DDoS
   volumetrik; itu tugas jaringan. Dokumen ini menutup lapisan aplikasi, bukan jaringan.

## 4. Arsitektur

```
    permintaan  ──►  sensor (8 titik di route yang sudah ada)
                        │  tulis 1 baris
                        ▼
                security_events  ──►  evaluator (tiap 30–60 dtk, jendela 5 menit)
                        │                    │  korelasi + skor
                        │                    ▼
                        │            security_incidents ──► notifikasi
                        │                    │            ├─ lonceng SA (addNotif)
                        │                    │            └─ SSE / polling admin
                        │                    ▼
                        └──────────►  playbook respons (L0–L4)
                                             ├─ L1 perketat/blokir (reversibel)
                                             ├─ L2 Mode Aman global (readonly)
                                             ├─ L3 pemeliharaan per modul
                                             └─ L4 putus total (manual, 2 orang)
```

Evaluator dijalankan oleh **permintaan yang datang** (piggyback), bukan oleh proses
terpisah: setiap N permintaan, satu permintaan "membayar" evaluasi. Alasannya praktis —
PM2 di server kantor hanya menjalankan satu proses Next.js; tidak ada worker. Kalau nanti
ada cron/MySQL EVENT, evaluator bisa dipindah tanpa mengubah aturan.

## 5. Skema usulan

```sql
-- jejak ancaman; append-only, tidak pernah di-UPDATE
CREATE TABLE IF NOT EXISTS security_events (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type  VARCHAR(48)  NOT NULL,          -- LOGIN_FAILED, FORBIDDEN_OWNERSHIP, PATH_PROBE, …
  severity    ENUM('INFO','LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'LOW',
  ip          VARCHAR(45)  NULL,              -- NULL kalau header proxy tidak dipercaya
  user_id     INT          NULL,
  username    VARCHAR(100) NULL,
  route       VARCHAR(160) NULL,
  method      VARCHAR(8)   NULL,
  status_code SMALLINT     NULL,
  ringkasan   VARCHAR(255) NOT NULL,
  sidik       CHAR(64)     NULL,              -- hash(body/UA) untuk dedup, bukan isi mentah
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_se_jenis_waktu (event_type, created_at),
  INDEX idx_se_ip_waktu    (ip, created_at),
  INDEX idx_se_user_waktu  (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- satu baris = satu dugaan serangan yang sudah dikorelasikan
CREATE TABLE IF NOT EXISTS security_incidents (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  kode          VARCHAR(24)  NOT NULL,        -- R1_CREDENTIAL_STUFFING, R3_IDOR_PROBE, …
  judul         VARCHAR(160) NOT NULL,
  severity      ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  status        ENUM('BARU','DIPERIKSA','DITANGANI','SELESAI','ABAI') NOT NULL DEFAULT 'BARU',
  jumlah_sinyal INT NOT NULL DEFAULT 0,
  ip_utama      VARCHAR(45) NULL,
  user_utama    VARCHAR(100) NULL,
  jendela_mulai DATETIME NOT NULL,
  jendela_akhir DATETIME NOT NULL,
  ringkasan     TEXT NULL,
  ditangani_oleh VARCHAR(100) NULL,
  ditangani_at  DATETIME NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_si_status (status, severity, created_at),
  INDEX idx_si_kode   (kode, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- penghubung supaya timeline bisa dibuka lagi kapan saja
CREATE TABLE IF NOT EXISTS security_incident_events (
  incident_id INT NOT NULL,
  event_id    BIGINT NOT NULL,
  PRIMARY KEY (incident_id, event_id),
  FOREIGN KEY (incident_id) REFERENCES security_incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id)    REFERENCES security_events(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- blokir aplikasi (L1); ip NULL = blokir per user/sesi
CREATE TABLE IF NOT EXISTS security_blocks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ip          VARCHAR(45) NULL,
  user_id     INT NULL,
  alasan      VARCHAR(255) NOT NULL,
  incident_id INT NULL,
  sampai      DATETIME NOT NULL,              -- wajib: blokir tanpa tenggat = lupa dibuka
  dibuat_oleh VARCHAR(100) NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sb_ip (ip, sampai),
  INDEX idx_sb_user (user_id, sampai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Catatan yang menentukan:

- **`ip` boleh NULL, dan itu keadaan normal** selama `TRUST_PROXY_HEADERS=false`
  (`lib/security/ratelimit.ts`). Jangan mengisi `'unknown'` ke kolom IP sebagai nilai
  sungguhan — blokir per `'unknown'` sama dengan memblokir seluruh kantor.
- **`sidik` = hash**, bukan isi body. Jangan simpan kata sandi yang salah diketik, token,
  atau potongan dokumen ke tabel ini. PDP: IP adalah data pribadi → retensi pendek
  (usulan 90 hari untuk `security_events`, 1 tahun untuk insiden), akses hanya SA.
- Retensi dijalankan lewat jalur yang sudah ada (`retensi-audit.ts` punya pola
  `Record<…>` dijaga TypeScript), bukan `DELETE` liar di route.

## 6. Sensor — delapan titik, semuanya di kode yang sudah ada

| # | Titik | Kejadian yang dicatat |
|---|---|---|
| 1 | `app/api/auth/login` | gagal sandi, akun terkunci, percobaan untuk username yang tidak ada (hanya hitungan, tanpa menyebut username ke tabel) |
| 2 | Semua route: hasil `pkRateLimit`/`bludRateLimit`/`checkRateLimit` = 429 | `RATE_LIMIT_HIT` + kunci remnya |
| 3 | `forbidden()` / `tolakEdit()` (403) | `FORBIDDEN` + menu + user |
| 4 | Pemeriksaan kepemilikan (404/403 "Bukan dokumen Anda") | `OWNERSHIP_MISS` — sinyal IDOR |
| 5 | Tolak Zod berulang pada route yang sama | `INVALID_BODY_BURST` (hanya jenis, bukan isi) |
| 6 | Unduhan/ekspor (`/download`, `/export`, PDF/rekap) | `EXPORT` + ukuran + jumlah per jendela |
| 7 | Aksi wewenang (`/api/admin/*`: peran, akses, nonaktif, putus sesi) | `AUTHZ_CHANGE` + target + alasan |
| 8 | Perubahan `app_config` (sakelar/pesan/tenggat) | `SWITCH_CHANGE` + nilai lama → baru |

`proxy.ts` **tidak** menulis DB: ia Edge Runtime dan berjalan sebelum sesi diketahui.
Yang ia lakukan hanya menandai (pola `x-prima-metode` yang sudah ada) supaya route tahu
ini permintaan yang mencurigakan. Pencatatan tetap di route, sesudah `getSession()`,
sehingga `user_id` benar dan tidak ada tulis DB di jalur terpanas.

Yang **tidak** dicatat: body permintaan, kata sandi, isi dokumen, cookie/token, parameter
pencarian penuh. `ringkasan` maksimal 255 karakter dan disusun dari template, bukan dari
input pengguna.

## 7. Aturan deteksi

Ambang di bawah ini usulan awal, **harus disetel ulang setelah 2 minggu data nyata** — data
kantor ini punya lonjakan wajar (impor 558 baris, cetak rekap akhir bulan, semua orang
login jam 07.30). Aturan yang ambangnya terlalu ketat akan membuat SUPER_ADMIN berhenti
membaca peringatan, dan itu kegagalan yang lebih mahal daripada tidak punya peringatan.

| Kode | Sinyal | Jendela | Ambang usulan | Severity | Usulan aksi |
|---|---|---|---|---|---|
| R1 | `LOGIN_FAILED` untuk ≥5 username berbeda dari sumber sama | 5 menit | ≥20 | HIGH | L1 (perketat + tawarkan blokir) |
| R2 | `PATH_PROBE` (404 pada `/.env`, `/wp-admin`, `/api/admin/*` tanpa sesi) | 2 menit | ≥30 | MEDIUM | L1 |
| R3 | `OWNERSHIP_MISS` dari satu user | 5 menit | ≥10 | HIGH | L1 (putus sesi + tanya) |
| R4 | `EXPORT` dari satu user | 10 menit | ≥15 unduhan atau >50 MB | HIGH | notif + tanya (bisa sah) |
| R5 | `AUTHZ_CHANGE` di luar jam kerja (sebelum 06.00 / sesudah 21.00) atau ≥3 perubahan pada satu akun dalam 1 jam | 1 jam | — | MEDIUM | notif |
| R6 | `SWITCH_CHANGE` pada sakelar oleh selain SA, atau sakelar dimatikan lalu dinyalakan berulang | 10 menit | ≥3 | MEDIUM | notif |
| R7 | `RATE_LIMIT_HIT` dari satu sumber lintas ≥3 route berbeda | 5 menit | ≥10 | MEDIUM | notif |
| R8 | Kegagalan tulis DB beruntun pada route yang sama | 5 menit | ≥5 | LOW | notif (bisa jadi gangguan, bukan serangan) |

Korelasi: satu insiden per (kode + sumber) dalam jendela yang sama. Insiden yang sudah
`DITANGANI`/`ABAI` tidak dibuka lagi sampai **cooldown** 30 menit lewat — tanpa itu, satu
serangan berkepanjangan menghasilkan ratusan baris dan notifikasi yang diabaikan.

Skor sederhana, bukan model: `severity` = tertinggi di antara sinyal, dinaikkan satu
tingkat bila ≥3 aturan berbeda menyala bersamaan. Bisa dijelaskan ke manusia dalam satu
kalimat, dan itu syaratnya — skor yang tidak bisa dijelaskan tidak akan dipercaya.

## 8. Notifikasi realtime

- **Jalur utama:** SSE `GET /api/admin/security/stream` (SA-only, satu koneksi per tab).
  Server mengirim `event: insiden` tiap ada baris baru; klien `EventSource` menampilkan
  toast + lencana angka di tab Insiden. Di LAN, satu koneksi menggantung jauh lebih murah
  daripada polling tiap tab.
- **Jalur cadangan:** bila koneksi gagal/terputus (proxy memutus idle), klien jatuh ke
  polling 10 detik `/api/admin/security/insiden?sejak=<id>`. Dua jalur, satu bentuk data.
- **Lonceng:** `addNotif(NOTIF_SUPER_ADMIN, 'SUPER_ADMIN', 'SECURITY_INCIDENT', …)` supaya
  peringatan tetap terlihat walau tab Admin Panel tidak dibuka. Isi notifikasi: judul,
  tiga angka (jumlah sinyal, sumber, jendela waktu), bukan pesan panjang.
- **Batas kebisingan:** maksimal **1 notifikasi per kode per 15 menit**. Peringatan yang
  tumpah ruah adalah peringatan yang dimatikan orang.

Jenis audit baru yang wajib digolongkan di `retensi-audit.ts`: `SECURITY_INCIDENT_BUKA`,
`SECURITY_MODE_AMAN`, `SECURITY_BLOKIR`, `SECURITY_BUKA_BLOKIR`, `SECURITY_LAPORAN_UNDUH`.

## 9. Playbook respons

| Tingkat | Tindakan | Efek pada pengguna | Siapa yang boleh | Pagar |
|---|---|---|---|---|
| **L0** | catat + notifikasi | tidak ada | otomatis | — |
| **L1** | perketat rate limit untuk sumber itu; putus sesi user; blokir IP/user (`security_blocks`) dengan tenggat | satu orang (atau satu IP kantor) kehilangan sesi | otomatis hanya untuk putus sesi + rate limit; blokir IP **harus** dikonfirmasi | harus ada tenggat; tombol buka blokir selalu tersedia |
| **L2** | **Mode Aman**: `app_status_global='readonly'` + pesan darurat + broadcast | semua tulis 503 dengan kalimat jelas; baca & cetak jalan | SUPER_ADMIN, dikonfirmasi dengan mengetik `MODE AMAN` + alasan | membuka butuh SUPER_ADMIN **dan** ADMIN (dual-control) |
| **L3** | pemeliharaan per modul (`app_status_<modul>='maintenance'` + `_pesan` + `_sampai`) | modul itu tertutup, lain jalan | SA/ADMIN sesuai tab App Control | tenggat wajib diisi |
| **L4** | putus akses aplikasi (matikan semua modul) | semua tertutup | SUPER_ADMIN + ADMIN | hanya untuk serangan dari dalam; audit wajib |

**"Simpan dulu, lalu bekukan"** — yang diminta pemilik, dan cara mencapainya jujur:

1. Mode Aman memakai `readonly`, **bukan** `maintenance`: pengguna masih bisa membuka,
   membaca, dan mencetak; yang berhenti hanya penulisan.
2. Sebelum aktif, layar menampilkan hitung mundur **60 detik** ("penyimpanan dibekukan
   dalam 60 detik — simpan pekerjaan Anda sekarang"). Timer di klien, keputusan tetap di
   server.
3. Draf yang belum tersimpan **tidak bisa** diselamatkan server (server tidak pernah
   menerimanya). Karena itu klien menyimpan ringkasan isian ke `localStorage` saat Mode
   Aman diumumkan, dan menawarkan "pulihkan isian" ketika Mode Aman dibuka lagi. Ini
   pengaman tambahan, bukan jaminan — dan harus ditulis begitu di layarnya.
4. Broadcast otomatis terkirim bersama Mode Aman, isinya: apa yang terjadi, apa yang
   masih bisa dilakukan, kapan akan ditinjau. Tanpa ini, 100 orang menelpon admin.

**Pagar aksi darurat** (semua tingkat, wajib):

- Konfirmasi mengetik nama aksi + alasan minimal 10 karakter; tanpa itu tombol tidak
  mengirim apa pun.
- Setiap aksi menulis `audit_log` **dan** `security_events` — dua tempat, karena audit bisa
  dipangkas retensi sementara insiden harus tetap bisa direkonstruksi.
- Membuka Mode Aman/L4: dual-control (dua akun berbeda) atau jeda paksa 10 menit sesudah
  diaktifkan. Aplikasi tidak boleh punya tombol "lumpuhkan semuanya" yang bisa dipakai
  satu akun yang sudah dibajak.

## 10. Layar (Admin Panel)

Dua tab baru, mengikuti pola `_panels/` yang sudah ada — bukan halaman terpisah:

- **INSIDEN** — daftar insiden (severity, kode, sumber, jendela, status), filter status,
  dan panel detail berisi timeline `security_incident_events` (jenis, waktu, route,
  status code, ringkasan). Tombol: Periksa, Abaikan (dengan alasan), Tangani, Ekspor CSV.
  Lencana angka di tab untuk insiden `BARU` ber-severity HIGH/CRITICAL.
- **MODE AMAN** — satu kartu: keadaan sekarang, tombol aktifkan (konfirmasi + alasan),
  hitung mundur, pilihan cakupan (seluruh aplikasi / modul tertentu), pratinjau teks
  broadcast, dan tombol buka (dual-control). Di sini juga tampil daftar blokir aktif
  beserta tenggatnya.

Tab lama tetap: `ATTACK MONITOR` (login) dan `BROADCAST` (manual) tidak dihapus — yang
pertama menjadi "sumber sinyal login" yang juga dibaca evaluator, yang kedua menjadi jalur
pesan biasa di luar darurat.

## 11. Forensik

Ringkasan satu halaman per insiden: apa yang dicoba, dari mana, berapa lama, apa yang
berhasil (dari `audit_log` pada jendela yang sama), apa yang dilakukan admin dan kapan.
Ekspor CSV untuk dibawa ke rapat. Ini yang membedakan "ada peringatan" dari "kami tahu apa
yang terjadi" — dan satu-satunya bagian yang berguna tiga bulan kemudian.

## 12. Yang diputuskan TIDAK dikerjakan

- **WAF/IPS sendiri.** Menulis parser serangan lengkap di dalam Next.js berarti
  memelihara sesuatu yang sudah ada di Nginx/fail2ban, dengan permukaan bug baru.
- **Auto-lockdown global otomatis.** Detektor hanya boleh mengusulkan; memutuskan tetap
  manusia. Satu positif palsu di jam sibuk = seluruh kantor berhenti, dan penyebabnya
  adalah kode kita sendiri.
- **Blokir IP otomatis sebelum Nginx terpasang + `TRUST_PROXY_HEADERS=true`.** Tanpa itu
  semua orang berbagi IP `'unknown'`.
- **Geo-blocking / reputasi IP cloud.** Aplikasi ini intranet; tidak ada daftar reputasi
  yang relevan dan tidak ada koneksi keluar yang dijamin.
- **Menyimpan body permintaan mencurigakan.** Itu justru menambah risiko kebocoran data.
- **Mengganti `audit_log`.** Audit tetap satu-satunya jejak aksi sah; defender membacanya,
  tidak menulis ke sana selain lewat `writeAuditLog`.

## 13. Risiko & jebakan

| Risiko | Kenapa berbahaya di PRIMA | Tanganan |
|---|---|---|
| IP `'unknown'` untuk semua orang | blokir IP = blokir seluruh kantor | L1 blokir IP dimatikan sampai proxy dipercaya; UI menolak mengaktifkannya |
| Positif palsu akhir bulan (cetak/impor) | notifikasi diabaikan, lalu serangan nyata lewat | ambang R4 dihitung per user + jam kerja; tombol "Abaikan 7 hari untuk aturan ini" |
| Evaluator memperlambat permintaan | piggyback berarti biaya di jalur panas | evaluasi maksimal 1×/30 detik, query ber-index, batas 200 baris |
| Tabel ancaman membengkak | MySQL satu server, dipakai juga untuk aplikasi | retensi 90 hari + arsip ringkasan harian |
| Data pribadi (IP, username) | PDP | akses SA-only, retensi pendek, tidak diekspor mentah ke layar non-admin |
| Mode Aman dipakai sebagai DoS | akun SA dibajak | dual-control + audit + batas waktu 2 jam lalu kembali `online` otomatis |
| Notifikasi sebagai satu-satunya kanal | tab ditutup, orang tidak lihat | lonceng + (opsional) email/Telegram webhook di fase 3 |

## 14. Fase eksekusi & DoD

| Fase | Isi | DoD |
|---|---|---|
| **1. Sensor & insiden** | 4 tabel + migrasi, `lib/security/defender.ts` (catat + evaluator), 8 titik sensor, 4 aturan pertama (R1–R3, R7), tab INSIDEN, notifikasi lonceng, polling 10 dtk | data uji nyata: 25 login gagal → 1 insiden HIGH muncul di tab dalam ≤60 dtk; tidak ada tulis DB di jalur GET biasa; `tsc`/`eslint` bersih; uji aturan memakai data buatan, bukan data kantor |
| **2. Mode Aman** | tombol L2 memakai `app_status_global`, hitung mundur 60 dtk di shell, draf `localStorage`, broadcast otomatis, audit `SECURITY_MODE_AMAN` | menyimpan saat Mode Aman aktif → 503 `MODUL_BACA_SAJA` dengan kalimat yang bisa dibaca; membaca & mencetak tetap 200; membuka butuh dua akun; semua aksi muncul di Audit Trail |
| **3. L1 & realtime** | blokir IP/user + tenggat, SSE `/api/admin/security/stream`, R4–R6, ekspor CSV | dua klien: satu memicu insiden, satu menerima dalam ≤5 dtk; blokir kedaluwarsa sendiri; `fail2ban`/`limit_req` Nginx didokumentasikan di PANDUAN §7 |
| **4. Pengerasan** | 2FA TOTP untuk SA, baseline jam akses, honeypot path, uji restore backup | login SA tanpa TOTP ditolak; jumlah temuan palsu per minggu < 5 |

## 15. Keputusan yang perlu persetujuan pemilik sebelum fase 1

1. **Ambang R1–R3** di §7 — terlalu ketat/ longgar? Disetel setelah 2 minggu data.
2. **Retensi**: 90 hari untuk `security_events`, 1 tahun untuk insiden — cukup?
3. **Siapa boleh membuka Mode Aman** — dual-control SA+ADMIN, atau SA saja dengan jeda 10 menit?
4. **Batas waktu Mode Aman otomatis** 2 jam (lalu `online` sendiri) — setuju? Ini yang
   mencegah "lupa dibuka" menjadi pemadaman permanen.
5. **Kanal notifikasi tambahan** (email/Telegram webhook) — perlu atau cukup lonceng + SSE?
6. **Apakah L1 blokir IP diaktifkan** — hanya setelah Nginx di depan dan
   `TRUST_PROXY_HEADERS=true`; kalau belum, fase 3 cukup blokir per user/sesi.

## 16. Pengerasan non-fitur (lebih berdampak daripada dashboard)

Disebut di sini supaya tidak hilang: backup harian MySQL + **uji restore** terjadwal,
review `app_access` tiap 6 bulan, `fail2ban` + `limit_req` di Nginx, patch dependensi
(gate B sudah ada di CI), dan 2FA untuk SUPER_ADMIN. Dashboard deteksi membuat serangan
lebih cepat diketahui; backup dan hak akses minimum yang menentukan seberapa parah
akibatnya.
