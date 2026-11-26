# Konsep — Penjaga Keamanan PRIMA (mengenali serangan & menanggapinya)

> Status: **KONSEP, revisi 2 (2026-11-24). Belum ada kode, belum ada tabel.**
> Revisi 1 ditulis sebelum Pemeliharaan & Keluar Otomatis, Pemeriksaan Mandiri, Tinjauan
> Akses, dan panel Drive & Backup ada. Revisi ini menyesuaikan dengan yang sudah terpasang
> dan dengan keadaan server kantor. Yang berubah dari revisi 1 dirangkum di §13.
> Skema di §6 masih usulan; kalau disetujui, ia masuk `docs/schema-mysql.sql` +
> `docs/migrations/migration-penjaga-*.sql` saat dikerjakan, bukan sebelumnya.

## 0. Kedudukan dokumen ini

PRIMA sudah punya banyak bahan keamanan: sakelar modul tiga keadaan, pembekuan seluruh
aplikasi, Pemeliharaan & keluar otomatis, jejak audit, rem laju (*rate limit*), kunci akun
setelah salah sandi, Pemeriksaan Mandiri, dan Tinjauan Akses. Yang belum ada adalah yang
**membaca semua itu bersama-sama**: mengenali pola yang mencurigakan, memberi tahu SUPER_ADMIN
tanpa harus membuka tab satu per satu, dan menyediakan tindakan yang aman untuk menghentikan
kerusakan tanpa menghentikan pekerjaan orang lain.

Dokumen ini menjawab empat hal: apa yang dikenali, dari mana datanya, ke siapa diberitahukan,
dan apa yang boleh dilakukan sesudahnya.

## 1. Masalah

1. **Yang dipantau hari ini hanya login.** Tab `ATTACK MONITOR` membaca `audit_log` untuk
   login berhasil/gagal/diblokir selama 24 jam. Unduhan borongan, penolakan berkas milik orang
   lain, perubahan wewenang yang aneh, dan sakelar yang dimatikan-dinyalakan berulang sudah
   **tercatat** di `audit_log`, tapi tidak ada yang membacanya sebagai pola.
2. **Tidak ada yang memberi tahu.** Semua tab keamanan baru memuat saat dibuka. Kalau tidak ada
   yang membuka Admin Panel, tidak ada yang tahu.
3. **Tidak ada jejak "dugaan".** `audit_log` menjawab "siapa melakukan apa". Pertanyaan "apa
   yang tampaknya sedang dicoba, sejak kapan, dan apa yang sudah dilakukan admin" tidak punya
   tempat.

## 2. Yang SUDAH ada dan TIDAK dibuat ulang

| Kemampuan | Berkas | Dipakai konsep ini untuk |
|---|---|---|
| Jejak audit + jenis peristiwa bertipe + retensi per jenis | `lib/security/auditlog.ts`, `lib/security/retensi-audit.ts` | **Sumber data utama fase 1** (§5) |
| Sakelar 3 keadaan per modul + sakelar seluruh aplikasi, pesan, tenggat | `lib/security/guard.ts`, `lib/registry/apps.ts`, `app_config` | Membekukan penyimpanan (§7) — nol kode pembekuan baru |
| Keterangan beku di layar (spanduk, tombol mati bersebab) | `lib/security/beku.ts`, `beku-lingkup.ts` | Kalimat yang dibaca pegawai saat penyimpanan dibekukan |
| Pemeliharaan & keluar otomatis: pesan, jeda, hitung mundur di tiap tab, tanya tiap 30 detik, tahan login | `lib/security/jadwal-keluar.ts`, `TabPemeliharaan`, `PenjagaPemeliharaan`, `/api/auth/pemeliharaan` | Pintu "bekukan penyimpanan" (§7) dan jalur lencana (§5.5) |
| Lonceng notifikasi, status baca per orang | `lib/services/notifications.ts` (`addNotif`, `NOTIF_SUPER_ADMIN`) | Kabar insiden saat Admin Panel tidak dibuka |
| Pemeriksaan Mandiri (temuan wewenang, tanpa tombol perbaiki) | `TabPemeriksaan`, `/api/admin/pemeriksaan` | Pola tampilan: temuan + jumlah + ke mana harus pergi |
| Tinjauan Akses berkala | `TabTinjauan` | Tindak lanjut insiden wewenang mengarah ke sini |
| Putus sesi per orang | `TabSessions`, `/api/admin/sessions` | Tanggapan tingkat 1 (§8) |
| Ganti sandi SUPER_ADMIN dari server | `scripts/setel-sandi-superadmin.mjs` | Tanggapan akun SUPER_ADMIN dibajak (§9) |
| Rem laju + kunci akun | `lib/security/ratelimit.ts`, `users.locked_until` | Sinyal fase 3, tidak diganti |

## 3. Keadaan server yang membatasi rancangan

Empat fakta ini yang paling banyak mengubah revisi 1:

1. **Server tidak bisa melihat IP pengguna.** Selama Nginx belum berdiri di depan aplikasi,
   `TRUST_PROXY_HEADERS` bernilai `false` dan `getClientIp` mengembalikan `'unknown'` untuk
   semua orang (`lib/security/ratelimit.ts`). Aturan yang dihitung "per sumber" akan melihat
   seluruh kantor sebagai satu sumber. Karena itu **semua aturan dihitung per akun**; aturan
   per IP menunggu fase 4.
2. **Aplikasi berjalan sebagai satu proses** di bawah PM2, di satu komputer Windows yang
   dimatikan tiap malam. Penghitung di memori cukup (tidak perlu dibagi antar proses), dan
   alat khas Linux (`fail2ban`) tidak tersedia.
3. **Repo ini publik.** Angka ambang yang ditulis di sini terbaca siapa pun, dan penyerang
   tinggal menjaga diri di bawahnya. Karena itu **dokumen ini tidak memuat angka ambang**;
   angkanya disimpan di `app_config` dan diatur dari panel (§5.3).
4. **SUPER_ADMIN menembus pembekuan** (`PERAN_TEMBUS_SAKELAR`). Membekukan penyimpanan tidak
   menghentikan akun SUPER_ADMIN yang dibajak — itu kasus tersendiri (§9).

## 4. Prinsip rancangan

1. **Baca dulu yang sudah tercatat.** Sensor baru di jalur permintaan dipasang hanya untuk
   kejadian yang memang belum tercatat di mana pun (fase 3).
2. **Tidak ada tulisan ke database per permintaan.** Yang ditulis hanya insiden — satu baris
   per dugaan — bukan satu baris per 404. Kalau tidak, banjir permintaan berubah jadi banjir
   tulisan ke MySQL, satu-satunya database aplikasi.
3. **Pemantau tidak boleh mematikan aplikasi.** Pemantau yang galat cukup diam (tidak ada
   kabar). Pagar akses tetap gagal-tertutup seperti sekarang. Dua arah ini sengaja berbeda:
   pagar yang salah menutup lebih merugikan daripada kabar yang terlewat.
4. **Mesin mengusulkan, manusia memutuskan.** Tidak ada pembekuan atau pemutusan otomatis
   untuk seluruh kantor. Satu dugaan keliru di jam sibuk = semua orang berhenti bekerja, dan
   penyebabnya kode kita sendiri.
5. **Jujur kepada pengguna.** Pesan menyebut yang sebenarnya ("penyimpanan dihentikan
   sementara untuk pemeriksaan keamanan"), bukan "pemeliharaan rutin". Alasan palsu yang
   dipakai berulang membuat orang berhenti membedakan gangguan biasa dari yang serius.
6. **Jangan mengaku melindungi yang tidak bisa dilindungi.** Aplikasi tidak bisa menahan
   banjir lalu lintas jaringan; itu urusan jaringan. Dokumen ini menutup lapisan aplikasi.

## 5. Fase 1 — Pantau dari jejak audit

### 5.1 Cara kerja

```
  audit_log (sudah ada)
        │  dibaca per jendela waktu, hanya jenis yang digolongkan (§5.2)
        ▼
  pemantau  ── dijalankan menumpang permintaan, paling sering sekali per menit
        │  aturan per akun + ambang dari app_config
        ▼
  penjaga_insiden  ──►  lencana di Admin Panel (ikut tanya 30 detik yang sudah ada)
                   └──►  lonceng SUPER_ADMIN (addNotif), dibatasi per aturan
```

- **Menumpang permintaan:** permintaan pertama sesudah satu menit lewat "membayar" satu putaran
  pemantauan, di belakang layar (tidak ditunggu jawabannya). Server mati semalam tidak masalah:
  saat menyala, putaran pertama membaca dari titik terakhir yang tersimpan, bukan dari "sejak
  menyala".
- **Titik terakhir** (`id` audit terakhir yang sudah dibaca) disimpan di `app_config`, jadi
  tidak ada peristiwa yang dibaca dua kali atau terlewat sesudah restart.
- **Satu putaran sekaligus:** putaran dikunci lewat `acquireBludLock('penjaga', 'pemantau')`;
  putaran kedua yang datang bersamaan langsung pulang.

### 5.2 Penggolongan jenis peristiwa

Daftar jenis yang dibaca berbentuk `Record<AuditEventType, Golongan | null>`, pola yang sama
dengan `retensi-audit.ts`. Akibatnya **jenis peristiwa baru wajib digolongkan** — TypeScript
menolak berkas yang lupa — termasuk unduhan baru di modul mana pun.

Golongan: `LOGIN_GAGAL`, `BERKAS_DITOLAK`, `UNDUHAN`, `WEWENANG`, `SAKELAR`, `PENYALAHGUNAAN`,
atau `null` (tidak dipantau).

### 5.3 Aturan

Semua dihitung **per akun pelaku** (`audit_log.user_id`/`username`), kecuali A1b yang memang
menghitung banyak akun. Angka ambang dan panjang jendela **tidak ditulis di sini**; nilai
awalnya diisi di migrasi, diatur SUPER_ADMIN dari panel, dan disetel ulang sesudah dua minggu
data nyata.

| Kode | Yang dikenali | Bahan di `audit_log` | Tingkat |
|---|---|---|---|
| A1a | Sandi salah berulang pada **satu akun** | `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGIN_BLOCKED` | Sedang |
| A1b | Sandi salah pada **banyak akun berbeda** dalam satu jendela (tebak sandi beruntun) | sama, dihitung jumlah akun berbeda | Tinggi |
| A2 | Berulang kali ditolak membuka berkas milik orang lain | `FILE_DOWNLOAD_DENIED` | Tinggi |
| A3 | Unduhan/ekspor borongan oleh satu akun | golongan `UNDUHAN` (`*_DOWNLOAD`, `*_UNDUH`, `*_EXPORT`, `USULAN_EXPORT`, `PK_VIEW_LIST`, …) | Sedang |
| A4 | Perubahan wewenang di jam yang tidak biasa, atau berulang pada satu orang sasaran | `ACCESS_GRANT`, `ACCESS_REVOKE`, `ROLE_CHANGE`, `USER_CREATE`, `PASSWORD_RESET`, `PROMOTION_*` (pakai `target_user_id`) | Sedang |
| A5 | Sakelar dimatikan-dinyalakan berulang | `CONFIG_UPDATE` (kunci `app_status_*`), `PEMELIHARAAN_KELUAR` | Sedang |
| A6 | Penyalahgunaan yang sudah dikenali modulnya sendiri | `RIMA_QUERY_ABUSE`, `BRUTE_FORCE`, `PROMOTION_BAD_PASSWORD`, `PROMOTION_BAD_SECRET` | Sedang |

Catatan per aturan:

- **A3 bisa sah.** Cetak rekap akhir bulan dan impor 558 baris memang ramai. Karena itu A3
  hanya memberi kabar, tanpa usulan tindakan, dan punya tombol "abaikan untuk akun ini 7 hari".
- **A4 "jam tidak biasa"** diatur sebagai rentang jam kerja di panel. Server memang mati di
  malam hari; perubahan wewenang di luar rentang berarti komputernya menyala dan dipakai di
  jam yang tidak lazim, dan itu sendiri patut diketahui.
- **Tingkat** naik satu bila dua aturan berbeda menyala untuk akun yang sama dalam jendela
  yang sama. Aturannya sengaja sederhana supaya bisa dijelaskan dalam satu kalimat — tingkat
  yang tidak bisa dijelaskan tidak akan dipercaya.

### 5.4 Satu dugaan, satu baris

- Satu insiden per (kode aturan + akun) selama insidennya masih terbuka. Sinyal berikutnya
  menambah hitungan dan memperpanjang jendela, tidak membuat baris baru.
- Insiden yang sudah ditangani/diabaikan tidak dibuka lagi sebelum masa tenang lewat; tanpa
  itu satu serangan panjang menghasilkan ratusan baris yang akhirnya diabaikan.

### 5.5 Kabar ke SUPER_ADMIN

- **Lencana:** angka insiden BARU bertingkat Tinggi di tab INSIDEN. Ikut pertanyaan 30 detik
  yang sudah dijalankan `PenjagaPemeliharaan` di tiap tab (hanya untuk SUPER_ADMIN), jadi tidak
  ada koneksi atau penanya baru. Revisi 1 mengusulkan koneksi siaran (SSE); dibuang, karena
  jumlah SUPER_ADMIN cuma beberapa orang dan jeda 30 detik sudah cukup.
- **Lonceng:** `addNotif(NOTIF_SUPER_ADMIN, …)` supaya terlihat walau Admin Panel tidak dibuka.
  Isinya judul + tiga angka (berapa kali, akun mana, sejak jam berapa).
- **Batas kebisingan:** paling banyak satu lonceng per aturan dalam selang yang diatur di panel.
  Kabar yang tumpah ruah adalah kabar yang dimatikan orang.

### 5.6 Tab INSIDEN (Admin Panel, SUPER_ADMIN)

Mengikuti pola `TabPemeriksaan`: daftar dugaan (tingkat, aturan, akun, jendela, status), dan
saat diklik, **daftar baris `audit_log` yang memicunya** (dibaca langsung dari `audit_log`
lewat jendela + akun, tidak disalin). Tombol: Periksa, Abaikan (dengan alasan), Selesai, dan
pintasan ke tindakan yang sudah ada — Putus sesi orang ini, Buka Pusat Akses orang ini.

Pengaturan ambang ada di kartu terpisah di tab yang sama. Setiap perubahan ambang dicatat di
audit (`PENJAGA_ATURAN_UBAH`, lama → baru), karena menaikkan ambang diam-diam adalah cara
termudah membutakan pemantau.

### 5.7 DoD fase 1

- Data uji buatan (tahun/akun kotak pasir): login gagal beruntun pada akun uji → satu insiden
  A1a muncul di tab dalam ≤ 1 menit sesudah permintaan berikutnya; sinyal tambahan tidak
  membuat baris kedua.
- Jenis peristiwa baru tanpa golongan → `tsc` gagal.
- Pemantau yang galat (mis. tabel belum dimigrasi) tidak membuat satu permintaan pun gagal.
- Tidak ada tulisan ke database di jalur permintaan selain baris insiden dan titik terakhir.
- `tsc` + ESLint bersih; gate G (sakelar) mengenali route baru.

## 6. Skema usulan

```sql
-- satu baris = satu dugaan; sinyalnya tetap di audit_log
CREATE TABLE IF NOT EXISTS penjaga_insiden (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  kode           VARCHAR(24)  NOT NULL,          -- A1a, A2, …
  tingkat        ENUM('RENDAH','SEDANG','TINGGI','KRITIS') NOT NULL,
  status         ENUM('BARU','DIPERIKSA','SELESAI','DIABAIKAN') NOT NULL DEFAULT 'BARU',
  user_id        INT          NULL,              -- akun pelaku; NULL untuk A1b (banyak akun)
  username       VARCHAR(50)  NULL,
  jumlah         INT          NOT NULL DEFAULT 0,
  audit_awal     BIGINT       NOT NULL,          -- id audit_log pertama yang memicu
  audit_akhir    BIGINT       NOT NULL,          -- id audit_log terakhir yang memicu
  jendela_mulai  DATETIME     NOT NULL,
  jendela_akhir  DATETIME     NOT NULL,
  ringkasan      VARCHAR(255) NOT NULL,          -- disusun dari templat, bukan dari isian pengguna
  catatan        VARCHAR(500) NULL,              -- alasan diabaikan / tindak lanjut
  ditangani_oleh VARCHAR(50)  NULL,
  ditangani_pada DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pi_status (status, tingkat, created_at),
  INDEX idx_pi_kode_akun (kode, user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- pemantau membaca per jenis + waktu; indeks yang ada hanya per kolom tunggal
CREATE INDEX idx_audit_log_event_waktu ON audit_log (event_type, created_at);
```

Ambang, jam kerja, masa tenang, dan titik terakhir disimpan di `app_config` (satu kunci JSON
`penjaga_aturan` + satu kunci `penjaga_titik`), divalidasi Zod saat ditulis — pola
`bba_pengaturan`.

Catatan:

- **Tidak ada tabel sinyal tersendiri di fase 1.** Sinyalnya sudah ada di `audit_log`; insiden
  hanya menunjuk rentang `id`-nya. Revisi 1 mengusulkan `security_events` +
  `security_incident_events`; ditunda ke fase 3 dan bentuknya berubah (§10).
- **Retensi:** insiden 1 tahun, dipangkas lewat jalur cron retensi yang sudah ada. Kalau baris
  audit yang ditunjuk sudah terpangkas, layar menyebut "rincian sudah melewati masa simpan".
- **Data pribadi:** username di tabel ini sama dengan yang sudah ada di `audit_log`; akses hanya
  SUPER_ADMIN. Tidak ada IP, isi permintaan, kata sandi, atau token yang disimpan.

## 7. Fase 2 — Bekukan penyimpanan lewat Pemeliharaan

Revisi 1 merancang "Mode Aman" dengan layar, hitung mundur, dan penyimpanan draf sendiri.
Hampir semuanya sudah ada di Pemeliharaan & Keluar Otomatis, jadi tidak dibangun dua kali.

- **Satu pilihan baru di tab Pemeliharaan:** di samping "Keluarkan semua", ada **"Bekukan
  penyimpanan"**. Pesan + jeda + hitung mundur di tiap tab memakai jalur yang sudah ada; saat
  batasnya lewat, sakelar seluruh aplikasi berpindah ke baca-saja dengan pesan dan tenggat.
  Membaca, mencetak, dan mengunduh tetap jalan.
- **Pesan bawaan** ditulis jujur, misalnya: "Penyimpanan dihentikan sementara untuk pemeriksaan
  keamanan. Anda masih bisa membuka dan mencetak data. Simpan pekerjaan Anda sebelum hitungan
  selesai."
- **Penyimpanan draf ke peramban dibuang dari rancangan.** Komputer kantor dipakai bergantian,
  jadi isian kerja bisa tertinggal di peramban orang lain. Hitung mundur sudah memberi waktu
  untuk menekan Simpan; itu yang ditawarkan, dan layar tidak menjanjikan lebih.
- **Pagar:** alasan wajib (≥ 10 huruf), tenggat wajib (pilihan seperti tahan login), kembali
  normal sendiri saat tenggat lewat. Membuka lebih awal: SUPER_ADMIN, dicatat di audit.
- **Bisa dipanggil dari insiden:** tombol di tab INSIDEN membuka tab Pemeliharaan dengan pesan
  terisi. Tetap manusia yang menekan Kirim.
- **Batasnya disebut di layar:** "Pembekuan tidak berlaku untuk SUPER_ADMIN" (§3 butir 4).

DoD: menyimpan saat beku → 503 `MODUL_BACA_SAJA` dengan kalimat yang bisa dibaca; membaca dan
mencetak tetap 200; tenggat lewat → kembali normal tanpa tindakan; semua aksi muncul di Jejak
Audit.

## 8. Tanggapan bertingkat

| Tingkat | Tindakan | Akibat bagi pengguna | Siapa | Sudah ada? |
|---|---|---|---|---|
| 0 | Catat + kabar | tidak ada | otomatis | fase 1 |
| 1 | Putus sesi satu orang; tahan akun (nonaktifkan) | satu orang keluar | SUPER_ADMIN, dari tab INSIDEN | ya — pintasan ke `TabSessions`/Pusat Akses |
| 2 | Bekukan penyimpanan seluruh aplikasi | semua tulis berhenti, baca jalan | SUPER_ADMIN | fase 2 |
| 3 | Tutup satu modul (pemeliharaan per modul) | modul itu tertutup | sesuai tab Kendali Aplikasi | ya |
| 4 | Keluarkan semua + tahan login | semua keluar | SUPER_ADMIN | ya — Pemeliharaan |

Tidak ada tingkat yang dijalankan mesin tanpa ditekan manusia (§4 butir 4).

## 9. Kalau akun SUPER_ADMIN yang dibajak

Pembekuan tidak menolong, karena SUPER_ADMIN menembusnya. Langkahnya, dari yang tercepat:

1. Dari akun SUPER_ADMIN lain: putus semua sesi akun yang dicurigai (`TabSessions`).
2. Di komputer server: `node scripts/setel-sandi-superadmin.mjs` untuk akun itu — sandi baru
   dicetak sekali, semua sesinya ikut dikeluarkan.
3. Bila perlu menghentikan semua orang: Pemeliharaan → Keluarkan semua + tahan login. Hanya
   SUPER_ADMIN yang masuk sesudah pesan dikirim yang tetap bisa masuk.
4. Baca Jejak Audit akun itu sejak dugaan pertama untuk tahu apa yang sudah diubah.

Langkah ini ditulis juga di panduan operasi server supaya tersedia walau aplikasi tidak bisa
dibuka.

## 10. Fase 3 dan 4 — yang menunggu

**Fase 3 — kejadian yang belum tercatat di mana pun.** Penolakan 403 dari pagar modul, 404
pada alamat yang dicari-cari, dan rem laju (429) tidak masuk `audit_log`. Kalau dibutuhkan:

- Dihitung **di memori** per akun (cukup satu proses, §3 butir 2), dengan jendela bergeser.
- Database baru ditulis saat ambang terlewati — langsung jadi insiden, bukan baris per
  kejadian.
- Permintaan tanpa sesi (pencarian alamat) hanya dihitung secara keseluruhan; tanpa IP tidak
  ada "sumber" yang bisa dibedakan.
- Hitungan hilang saat server dimatikan. Itu diterima: yang hilang hanya dugaan yang belum
  melewati ambang.

**Fase 4 — sesudah Nginx berdiri di depan dan `TRUST_PROXY_HEADERS=true`.**

- Aturan per IP (tebak sandi dari satu komputer, pencarian alamat dari satu komputer).
- Blokir IP bertenggat (`penjaga_blokir`), dengan tombol buka yang selalu tersedia.
- Rem laju di Nginx (`limit_req`), didokumentasikan di panduan instalasi §11.2.

**Di luar fitur, tapi lebih menentukan akibatnya** (dipertahankan dari revisi 1):

- **Uji pulihkan cadangan** terjadwal — cadangan yang belum pernah dipulihkan belum terbukti.
- **Verifikasi dua langkah (TOTP) untuk SUPER_ADMIN**, menutup sebagian besar §9.
- Tinjauan Akses berkala (sudah ada alatnya; yang perlu adalah kebiasaannya).

## 11. Yang diputuskan TIDAK dikerjakan

- **Penyaring serangan sendiri di dalam aplikasi (WAF).** Memelihara pengurai serangan di
  Next.js menambah permukaan bug; tempatnya di depan aplikasi.
- **Pembekuan atau pemutusan otomatis untuk seluruh kantor.** Mesin hanya mengusulkan.
- **Aturan dan blokir per IP sebelum Nginx terpasang.** Semua orang terbaca `'unknown'`.
- **Menyimpan isi permintaan yang mencurigakan.** Justru menambah risiko kebocoran.
- **Menulis sinyal ke tabel per permintaan.** Lihat §4 butir 2.
- **Koneksi siaran (SSE) untuk kabar.** Pertanyaan 30 detik yang sudah ada cukup.
- **Penyimpanan draf di peramban saat pembekuan.** Lihat §7.
- **Mengganti `audit_log`.** Penjaga hanya membacanya, dan menulis jejaknya sendiri lewat
  `writeAuditLog`.

## 12. Risiko & jebakan

| Risiko | Kenapa berbahaya | Tanganan |
|---|---|---|
| Dugaan keliru akhir bulan (cetak, impor) | kabar diabaikan, lalu yang sungguhan lewat | A3 hanya kabar; "abaikan akun ini 7 hari"; ambang disetel dari data nyata |
| Ambang dinaikkan diam-diam | pemantau buta tanpa ada yang tahu | perubahan ambang dicatat di audit (lama → baru) |
| Pemantau memperlambat permintaan | menumpang permintaan | paling sering sekali per menit, tidak ditunggu, kueri berindeks, batas baris per putaran |
| Server mati semalam, peristiwa menumpuk | putaran pertama pagi berat | titik terakhir + batas baris per putaran; sisanya dibaca putaran berikutnya |
| Akun SUPER_ADMIN dibajak | menembus pembekuan, bisa mengubah ambang | §9; perubahan ambang terjejak; TOTP di fase 4 |
| Lonceng satu-satunya kanal | tidak ada yang membuka PRIMA | lencana + lonceng; kanal luar (surel/pesan) dibahas bila diminta |
| Angka ambang terbaca publik | penyerang menyesuaikan diri | angka di `app_config`, tidak di repo |

## 13. Yang berubah dari revisi 1

| Revisi 1 | Revisi 2 | Sebab |
|---|---|---|
| Delapan sensor baru + tabel `security_events` | Fase 1 membaca `audit_log` saja | sinyal utamanya sudah tercatat |
| Aturan per IP sumber | Per akun | server membaca semua IP sebagai `'unknown'` |
| Tulis satu baris per kejadian | Tulis satu baris per dugaan | banjir permintaan tidak boleh jadi banjir tulisan |
| Angka ambang di dokumen | Angka di `app_config`, diatur di panel | repo publik |
| "Mode Aman" dengan layar & hitung mundur sendiri | Pilihan "Bekukan penyimpanan" di Pemeliharaan | hitung mundur, pesan, tenggat sudah ada |
| Draf disimpan di peramban | Dibuang | komputer dipakai bergantian |
| SSE + cadangan polling | Ikut tanya 30 detik yang sudah ada | sedikit SUPER_ADMIN, satu jalur cukup |
| Mode Aman dianggap menahan akun SA dibajak | Langkah tersendiri (§9) | SUPER_ADMIN menembus pembekuan |
| `fail2ban` di DoD | Dibuang; `limit_req` Nginx di fase 4 | server Windows |
| Istilah asing (playbook, dual-control, honeypot) | Kata sehari-hari | dibaca pemilik & pegawai |

## 14. Keputusan yang perlu dari pemilik sebelum fase 1

1. **Urutan fase** — fase 1 (pantau dari audit) dulu, fase 2 (bekukan penyimpanan) menyusul?
2. **Siapa menerima kabar** — semua SUPER_ADMIN, atau juga ADMIN?
3. **Rentang jam kerja** untuk A4 — misalnya 06.00–18.00 hari kerja? (Disimpan di panel, bukan
   di repo.)
4. **Membuka pembekuan lebih awal** — cukup satu SUPER_ADMIN dengan alasan, atau perlu dua
   orang? Usulan: satu orang + alasan, karena tenggat sudah memaksa kembali normal sendiri.
5. **Masa simpan insiden** — usulan 1 tahun.
6. **Kanal luar** (surel atau pesan ke ponsel) — perlu, atau cukup lonceng + lencana?
