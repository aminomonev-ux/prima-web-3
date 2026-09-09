# CONCEPT — Pusat Akses: pengaturan akun & hak akses dari satu pintu

> Status: **Tahap 1 & 2 DIKERJAKAN 2026-09-09 — menunggu verifikasi peramban.** Ditulis &
> difinalkan 2026-09-08; enam keputusan §9 diambil 2026-09-09; pemeriksaan server kantor
> dijalankan hari yang sama dan putusannya **aman** (hasilnya di §17.2 Tahap 0). Yang sudah dikerjakan baru **R0 (maket)** —
> `docs/design/revamp-admin-pusat-akses.html`, yang sejak 2026-09-09 berstatus **acuan
> tampilan yang mengikat** untuk kedua tema. **Urutan kerja yang berlaku: §17.**
> Prasyarat baca: `docs/CONCEPT-menu-access-control.md` (registry + izin per-menu),
> `docs/CONCEPT-blud-peran.md`, `docs/CONCEPT-pk-peran.md`,
> `docs/CONCEPT-usulan-peran.md` (dibatalkan), `docs/CONCEPT-kinerja-peran.md` (ditolak).
>
> Dokumen ini **tidak membatalkan** keputusan di keempat berkas itu. Ia meneruskan satu
> pekerjaan yang memang tertinggal (Fase 1 registry), menutup 13 temuan yang lahir dari
> tertinggalnya, dan membungkus semuanya jadi satu layar.

---

> **Isi dokumen.** **Bagian I (§1–§10)** — keadaan hari ini, 16 temuan, penyatuan
> delapan daftar jadi satu registry, dan layar Pusat Akses. **Bagian II (§11–§16)** —
> pengembangan: dua belas kemampuan baru yang membuat "satu pintu" benar-benar berarti,
> masing-masing dengan biaya dan batasnya, penataan ulang Admin Panel, dan **§16 revamp
> tampilannya** (disetujui pemilik aplikasi 2026-09-08). **Bagian III (§17)** — rencana
> kerja final: 14 tahap, prasyarat, dan syarat selesainya masing-masing.
>
> **Kalau cuma sempat membaca satu bagian: §17.**

## 0. Ringkasan satu paragraf

Hari ini "siapa boleh apa" di PRIMA dijawab **delapan daftar terpisah** yang tidak saling
terikat tipe. Tiga di antaranya sudah benar-benar berbeda isi — dan akibatnya bukan
teoretis: **tiga sakelar pemeliharaan di Admin Panel tidak menutup apa pun**, **satu
sakelar yang benar-benar menjaga tidak punya tombolnya**, **kartu Dashboard terkunci
justru untuk Kasubag & Kabag yang jadi audiens utamanya**, dan **menurunkan peran
seseorang tidak berlaku sampai ia logout**. Konsep ini menyatukan kedelapan daftar jadi
satu registry, memperbaiki 15 temuan, lalu menaruh seluruh pengaturan akun & akses di
**satu layar per orang** di Admin Panel — yang menampilkan bukan cuma keadaan, tapi
**sebabnya** ("terbuka karena peran", bukan sekadar centang). Modul Usulan Kebutuhan
**tetap** punya panel Kelola User-nya sendiri (memang dibutuhkan), tapi berhenti punya
aturan sendiri: ia memakai pagar dan peringatan yang sama.

---

## 1. Temuan — 16 koreksi, semuanya diverifikasi dari kode

Urutan menurut akibat, bukan menurut mudahnya diperbaiki. Kolom "bukti" menyebut berkas
yang saya baca mentah (bukan hasil kompresi) untuk memastikannya.

### 🔴 T-1 · Tiga sakelar pemeliharaan tidak menutup apa pun

`app_status_usulan_aset`, `app_status_perjanjian_kinerja`, dan `app_status_dashboard`
ada di whitelist server (`app/api/admin/app-status/route.ts` `APP_KEYS`) dan punya
tombolnya di Admin Panel (`_panels/_shared.ts` `APP_STATUS_LABELS`) — tapi **tidak ada
satu pun halaman atau route yang memeriksanya**. Pencarian seluruh `app/` + `lib/` untuk
ketiga nama itu hanya menemukan dua berkas: daftar label dan daftar whitelist. Tidak ada
`modulMati()` di `app/api/usulan/*`, `app/api/perjanjian-kinerja/*`, `app/api/dashboard/*`;
tidak ada `modulSedangMati()` di `usulan-kebutuhan/page.tsx` maupun `dashboard/page.tsx`.

Yang terjadi kalau sakelarnya dimatikan: kartunya jadi abu di `/menu` dan mengkliknya
melempar ke `/maintenance` (`menu-client.tsx` `handleCardClick`). **Mengetik URL-nya
langsung tetap masuk penuh — baca DAN tulis.**

Ini persis **L72/T1**, pelajaran yang sudah dipetik dan sudah ditutup untuk enam modul
lain. Yang membuatnya bertahan diam-diam: penjaganya sendiri.
`scripts/test-killswitch-modul.mjs` memindai **daftar direktori yang ditulis tangan** —
enam modul (Rencana Aksi, BBA, IKI, LKJIP, E-Anggaran, BLUD). Tiga modul ini tidak ada
di daftar itu, jadi gate G **tidak bisa** mengeluh soal mereka. Gate yang daftarnya
ditulis tangan hanya menjaga apa yang seseorang ingat untuk didaftarkan.

### 🔴 T-2 · Mengubah peran tidak berlaku sampai orangnya logout

`role` ikut ditandatangani ke dalam JWT. `proxy.ts` membaca `session.role` untuk
`ROLE_ROUTES` **dan** untuk menulis header `x-user-role` yang dipercaya seluruh server
component; `requireRole()` juga membacanya dari token, bukan dari DB.

`PATCH /api/admin/users` `action='ubah-role'` mengubah kolom `users.role` dan menghapus
perkecualian menunya — tapi **tidak menyentuh `user_sessions`**. Bandingkan dengan jalur
promosi: `lib/data/promotion.ts` (`revokeProbation`) melakukannya, lengkap dengan
komentar *"Invalidate semua session aktif user (force re-login dengan role baru)"*.

Akibatnya asimetris dan arahnya buruk: **menaikkan** peran memang tertunda (tidak
berbahaya), tapi **menurunkan** peran juga tertunda — dan itu justru yang biasanya
mendesak. Lebih jauh lagi, `POST /api/auth/keepalive` menandatangani ulang **payload
lama** (`createToken(session, session.sessionId)`), jadi selama orangnya masih membuka
aplikasi, peran lamanya ikut diperpanjang terus.

**Berapa lama tepatnya** — diperiksa ulang 2026-09-09, karena angka ini yang menentukan
keputusan §9-2. `SESSION_ABSOLUTE_LIFETIME_HOURS` = 7 hari, tapi itu ceiling teoretis;
yang mengikat lebih dulu ada dua: `SESSION_DURATION_HOURS` = **8 jam** sejak keepalive
terakhir, dan `SESSION_INACTIVE_MINUTES` = **60 menit** menganggur. Ditambah servernya
laptop kantor yang **dimatikan tiap malam** — keepalive tidak mungkin jalan semalaman —
batas nyatanya jadi **sampai akhir hari kerja itu**, bukan seminggu.

Ini **L69**: perbaikan yang sudah benar di satu jalur tulis, tidak pernah menular ke
jalur tulis kedua.

### 🔴 T-3 · Menonaktifkan akun tidak memutus sesi yang sedang berjalan

`status='NONAKTIF'` hanya diperiksa di `app/api/auth/login/route.ts`. `getSession()`
memeriksa pencabutan sesi (`user_sessions.invalidated_at`), idle timeout, dan absolute
lifetime — **tidak** memeriksa `users.status`. Dan `action='nonaktif'` di route admin
juga tidak mencabut sesi.

Hasilnya: menonaktifkan pegawai yang sedang login **tidak menghentikannya**. Ia tetap
bisa menyimpan, menghapus, dan mengunduh sampai 60 menit tanpa aktivitas — atau selamanya
selama ia tetap aktif. Untuk aplikasi yang tombol "NONAKTIF"-nya dipakai persis pada hari
seseorang pindah/berhenti, ini yang paling sering akan menggigit.

### 🟠 T-4 · Tombol MENU disembunyikan oleh syarat khas BLUD

`TabUserMgmt.tsx` menampilkan tombol **MENU** (perkecualian akses per-menu) hanya kalau
`punyaBlud(u)` — fungsi yang memeriksa `app_access` memuat `'blud'`. Padahal modal di
baliknya (`MenuAccessModal`) sudah punya pemilih modul dari registry (`PilihModul`,
`MENU_APPS`) dan sudah melayani **BLUD dan Perjanjian Kinerja** sejak 2026-08-03.

Jadi orang yang cuma diberi `perjanjian_kinerja` **tidak pernah melihat tombolnya**, dan
perkecualian menu PK-nya tak terjangkau dari layar. Fitur yang dibangun untuk modul kedua
hanya bisa dipakai lewat pintu modul pertama.

### 🟠 T-5 · Sakelar sub-modul Realisasi BLUD tidak punya tombol

`app_status_blud_realisasi` ada di whitelist server, **dan benar-benar dijaga**
(`app/api/blud/_guard.ts` memanggil `modulMati([FLAG_BLUD, FLAG_BLUD_REALISASI])`,
`blud/page.tsx` & `blud/_izin.ts` ikut menghormatinya). Tapi kuncinya **tidak ada** di
`APP_STATUS_LABELS`, dan TabAppControl merender dari daftar label itu.

Jadi satu-satunya cara mematikan penatausahaan harian BLUD tanpa mematikan seluruh BLUD
adalah **menyunting `app_config` langsung di MySQL**. Kebalikan persis dari T-1: di sana
tombolnya ada tapi tidak menjaga; di sini penjaganya ada tapi tombolnya tidak.

### 🟠 T-6 · Kartu Dashboard terkunci untuk Kasubag & Kabag

`isDashboardRole` memberi akses default ke `SUPER_ADMIN, ADMIN, ADMIN_KASUBAG,
ADMIN_KABAG` — dan halaman `/dashboard` maupun `/api/dashboard` menerima mereka. Tapi
`APP_CHECKS` di `app/api/user/access/route.ts` memuat **tujuh** modul dan `dashboard`
bukan salah satunya. Untuk ADMIN_KASUBAG/ADMIN_KABAG (yang bukan `SUPER_ADMIN`/`ADMIN`,
jadi tidak kena jalan pintas `app_access: null`), daftar efektifnya lahir tanpa
`dashboard` → `isLocked()` di `menu-client.tsx` mengunci kartunya.

Peran yang jadi audiens utama Dashboard harus diberi grant manual supaya kartunya
menyala, padahal grant itu tidak menambah hak apa pun yang belum ia punya.

### 🟠 T-7 · Mengaktifkan kembali akun tidak memeriksa kuota

Kuota peran dihitung **real-time** dari `COUNT(*) WHERE role=? AND status='AKTIF'`
(`lib/security/promotion.ts`). Tiga pintu masuk dijaga `assertQuotaAvailableTx`:
buat akun, ubah peran, approve promosi. Pintu keempat — `action='aktifkan'` — langsung
`UPDATE users SET status='AKTIF'` tanpa memeriksa apa pun.

Jadi urutan "nonaktifkan A → isi slotnya dengan B → aktifkan A lagi" melewati cap
`ADMIN_QUOTA=6` / `SUPER_ADMIN_QUOTA=4` / `ROLE_QUOTA=3` tanpa satu pesan pun. CLAUDE.md
menyebut tiga entry point; yang keempat tidak disebut dan tidak dijaga.

### 🟠 T-8 · Ubah peran dari Usulan berjalan tanpa satu pun pagar layar

`doChangeRole` di `usulan-client.tsx` memanggil endpoint yang **sama persis**
(`PATCH /api/admin/users`, `action='ubah-role'`) — langsung pada `onChange` dropdown.
Tanpa konfirmasi, tanpa penanda kuota `(n/max)`, dan tanpa peringatan bahwa perkecualian
akses menu orang itu akan ikut terhapus dan probation promosinya dibatalkan.

Ketiganya **ada** di Admin Panel dan ditulis dengan susah payah (peringatan
`menu_exceptions` bahkan punya kalimat khusus di modal ROLE). Satu aksi berdampak sama,
dua tingkat kehati-hatian — dan yang lebih longgar justru yang lebih sering dipakai
sehari-hari.

### 🟡 T-9 · Key `admin` di `AppAccessKeyEnum` tidak dibaca siapa pun

`'admin'` sah menurut Zod, tapi tidak ada di `APP_ACCESS_LIST` (checkbox), tidak dibaca
`/api/user/access`, dan kartu Admin Panel dijaga `roles: ['SUPER_ADMIN']` di
`menu-client.tsx` — bukan oleh `app_access`. Memberikannya tidak melakukan apa-apa, dan
menghabiskan satu dari sepuluh slot `.max(10)`. Contoh drift yang sudah ditulis sendiri
di `CONCEPT-menu-access-control.md` §1.2 dan belum pernah ditutup.

### 🟡 T-10 · Daftar menu yang dibacakan RIMA sudah basi

`lib/sentinel/module-menus.ts` adalah cermin manual — komentarnya sendiri menulis
**"⚠️ DRIFT"**. Dan ia sudah tertinggal: daftar BLUD-nya berhenti di 8 menu (belum memuat
Buku Kas, Bukti Setor, Realisasi, Tutup Kas — empat menu penatausahaan), daftar Admin
Panel-nya belum memuat **AKSES MENU** dan **RIMA FEEDBACK**.

Jadi ketika orang bertanya ke RIMA "menu apa saja di BLUD", jawabannya salah — dan
salahnya ke arah yang paling membingungkan: menyebut lebih sedikit dari yang ada, jadi
orang menyimpulkan ia tidak punya aksesnya.

### 🟡 T-11 · `NAV_MODULES` tidak memuat Dashboard

`lib/sentinel/nav.ts` memuat 9 modul; `dashboard` bukan salah satunya. "buka dashboard"
ke RIMA tidak menemukan tujuannya. Daftar modul ke-delapan, dan ke-delapan-delapannya
harus disinkronkan tangan.

### 🟡 T-12 · Hapus akun = DELETE keras, padahal kebijakan retensinya anonimisasi

`users.deleted_at` ada (migration 028, UU PDP Pasal 16) dan cron
`app/api/cron/purge-retention` meng-**anonimisasi** akun NONAKTIF > 5 tahun dengan
komentar *"preserve FK, hapus PII"*. Tapi tombol HAPUS di Admin Panel menjalankan
`DELETE FROM users WHERE id = ?`.

Akibatnya `rekap_pk.saved_by`, `menu_role_access.updated_by`, `menu_user_access.updated_by`
jadi NULL (`ON DELETE SET NULL`) — jejak "siapa yang menyimpan rekap ini" dan "siapa yang
memberi izin ini" hilang, sementara `audit_log` (tanpa FK) tetap menyebut namanya.
Dua kebijakan berlawanan untuk satu tabel yang sama.

### 🟡 T-13 · Angka peran di CLAUDE.md tidak cocok dengan kode

CLAUDE.md menulis *"→ `BIDANG_*` (4) → `SUB_BIDANG` (18 roles)"*. Kenyataannya
`BIDANG_ROLES` berisi **10** nama dan `SUBBIDANG_ROLES` berisi **13** (total 27 peran
bersama 4 admin tier). Ini bukan cuma salah hitung: CLAUDE.md juga menulis kuota
`ROLE_QUOTA` *"berlaku untuk 6 BIDANG_ROLES"*, sedangkan `getRoleQuota` memberi cap
kepada **sepuluh-sepuluhnya**. Orang yang membaca dokumen lalu menghitung slot akan
salah.

### 🟡 T-14 · `ConfigKeyEnum` tidak dipakai siapa pun, dan komentarnya menunjuk ke sana

`lib/data/admin-schemas.ts` mendefinisikan `ConfigKeyEnum` (5 kunci) dengan komentar
*"Whitelist key di sini untuk POST"*. Pencarian seluruh repo: **nol pemakai**.
`POST /api/config` punya daftar sendiri di dalam badan fungsinya — **15 kunci**, ditulis
inline. Jadi orang yang menambah kunci konfigurasi baru dan mengikuti komentar itu akan
mendapat 400 tanpa tahu kenapa.

Bukan lubang keamanan (daftar inline-nya benar-benar menjaga), tapi bentuk yang sama
dengan §2: satu fakta di dua tempat, dan yang menang bukan yang didokumentasikan.

### 🟡 T-15 · Audit tidak menyimpan SIAPA yang dikenai, cuma siapa yang melakukan

`audit_log.username` = pelaku. Sasarannya tenggelam di `detail` sebagai teks bebas:
`"Ubah role user id=12"`. Akibatnya pertanyaan yang paling sering ditanyakan saat ada
masalah — *"akses Sari pernah diubah siapa dan kapan?"* — **tidak bisa dijawab** lewat
tab Audit Trail (penyaringnya cuma `event_type`, `username` pelaku, dan tanggal).

Dan mencarinya manual pun jebakan: `detail LIKE '%id=12%'` ikut cocok dengan `id=120`,
`id=123`, `id=127`. Pencarian yang kelihatan berhasil dan diam-diam salah.

### 🟠 T-16 · Pagar API lebih longgar daripada pagar layar — ADMIN punya tiga wewenang tanpa layar

Ditemukan 2026-09-09, saat memastikan keputusan §9 nomor 1. Layarnya sudah benar:
`proxy.ts:82` (`'/admin': ['SUPER_ADMIN']`) dan `app/(dashboard)/admin/page.tsx:11`
sama-sama memulangkan ADMIN ke `/menu`. Yang tidak ikut ketat: **API-nya**.

`PATCH /api/admin/users` lolos untuk `ADMIN || SUPER_ADMIN` (`route.ts:127`), dan di
dalamnya hanya `reset-password` yang punya lantai SUPER_ADMIN sendiri (`route.ts:233`):

| Aksi | Layar yang bisa dibuka ADMIN | Bisa dipanggil ADMIN |
|---|---|---|
| `ubah-role` | ada — Kelola User di Usulan | ya, **memang perlu** |
| `nonaktif` / `aktifkan` | tidak ada | **ya** |
| `set-app-access` | tidak ada | **ya** |
| `GET`/`POST /api/admin/menu-access` | tidak ada | **ya** (`menu-access/route.ts:71,157`) |
| `reset-password` | tidak ada | tidak — lantai sendiri |
| `POST` (buat akun) / `DELETE` | tidak ada | tidak |

Yang paling tajam: pagar tier ADMIN (`ADMIN_TIER_ROLES`, `route.ts:166`) hanya berdiri
**di dalam cabang `ubah-role`**. Jadi ADMIN tidak bisa mengubah peran seorang
ADMIN_KABAG — tapi bisa **menonaktifkan akunnya**. Lewat `set-app-access` ia juga bisa
memberi orang lain akses modul apa pun; lewat `menu-access` ia bisa menulis perkecualian
menu per-orang (aturan per-PERAN tetap SUPER_ADMIN, `menu-access/route.ts:218`).

Bukan lubang menganga — ADMIN peran tepercaya, dibatasi 6 akun, dan target SUPER_ADMIN
tetap ditolak (`route.ts:143`). Tapi ini **L82 apa adanya**: tombol yang tidak ada di
layar bukan berarti jalurnya tertutup. Dan begitu §9 nomor 1 dijawab "Admin Panel
SUPER_ADMIN saja", ia berhenti jadi ketimpangan dan berubah jadi **selisih antara aturan
yang diucapkan dan aturan yang berlaku** — bentuk L88.

**Yang TIDAK boleh ikut diperketat**: `GET /api/admin/users` dan `PATCH ubah-role`.
Panel Kelola User di Usulan berdiri di atas keduanya (`usulan-client.tsx:601` lewat
`usePaginatedList`, dan `:906` untuk `doChangeRole`) — dan panel itu memang dibutuhkan.
Seluruh pemanggil kedua endpoint sudah ditelusuri: mempersempit tiga aksi sisanya
**tidak memutus satu tombol pun** yang ada sekarang.

---

## 2. Akar bersama — dan kenapa memperbaikinya satu per satu tidak cukup

T-1, T-5, T-6, T-9, T-10, T-11 **semuanya** temuan yang sama dalam bentuk berbeda:
satu fakta ("modul X ada, namanya `x`, pintunya `isXRole`, sakelarnya `app_status_x`")
ditulis di banyak tempat, dan tempat-tempat itu tidak saling memaksa.

Inventaris hari ini — **delapan** daftar, naik dari enam yang dicatat 2026-08-01:

| # | Daftar | Lokasi | Isinya |
|---|---|---|---|
| 1 | `APP_CARDS` | `app/(dashboard)/menu/menu-client.tsx` | kartu `/menu` (id, label, href, ikon, warna, `roles`) |
| 2 | `APP_ACCESS_LIST` | `app/(dashboard)/admin/_panels/TabUserMgmt.tsx` | checkbox "Atur Akses Aplikasi" — 9 entri |
| 3 | `APP_STATUS_LABELS` | `app/(dashboard)/admin/_panels/_shared.ts` | label sakelar App Control — 11 entri |
| 4 | `AppAccessKeyEnum` | `lib/data/admin-schemas.ts` | whitelist Zod — 10 nilai (termasuk `admin` yang mati) |
| 5 | `APP_KEYS` | `app/api/admin/app-status/route.ts` | whitelist sakelar server — 12 kunci |
| 6 | `APP_CHECKS` | `app/api/user/access/route.ts` | id → `isXRole` — 7 entri |
| 7 | `NAV_MODULES` | `lib/sentinel/nav.ts` | tujuan navigasi RIMA — 9 entri |
| 8 | `MODUL` | `scripts/test-killswitch-modul.mjs` | direktori yang diperiksa gate G — 6 entri |

Ditambah dua cermin manual: `lib/sentinel/module-menus.ts` (menu di dalam tiap modul)
dan `MENU_APPS` di `lib/registry/menu-apps.ts` (yang sudah benar — ia **menurunkan**
daftarnya dari `peran.ts` tiap modul, bukan mengetik ulang).

Angka-angka di kolom terakhir tidak sama, dan **tidak seharusnya** sama semuanya — tapi
tiap selisih hari ini adalah selisih yang tidak disengaja, bukan yang dijelaskan.

Yang paling penting dari tabel itu justru baris **#8**: penjaga otomatis yang seharusnya
menangkap T-1 punya daftarnya sendiri yang ditulis tangan. **Selama daftar penjaga
diketik terpisah dari daftar yang dijaga, penjaganya hanya menjaga yang sudah diingat.**
Itu sebabnya perbaikan satu per satu tidak cukup: perbaikan hari ini tidak mencegah
modul ke-sepuluh mengulanginya bulan depan.

---

## 3. Ruang lingkup

### Yang BERUBAH
- Delapan daftar di §2 → diturunkan dari **satu registry** `lib/registry/apps.ts`.
- `is*Role` delapan modul → satu implementasi generik (bentuknya sudah identik, §4.2).
- Admin Panel dapat satu layar baru: **Pusat Akses**, satu halaman per orang.
- Tiga sakelar yang tidak menjaga → benar-benar menjaga; satu sakelar yang tak bertombol
  → bertombol.
- Ubah peran & nonaktifkan → berlaku saat itu juga.
- Panel Kelola User di Usulan → tetap ada, tapi memakai pagar & peringatan yang sama.

### Yang TIDAK berubah
- **Bentuk `users.app_access`.** Tetap larik datar id modul. `hasAppAccess()` God Node,
  dan mengubah **bentuk data yang ia baca** sama berisikonya dengan mengubah kodenya.
- **Dua tabel izin per-menu** (`menu_role_access`, `menu_user_access`) dan seluruh
  `lib/data/menu-access.ts`. Sudah benar, sudah teruji, tidak disentuh.
- **Nama cookie, `getSession()`, `verifyToken()`, `setSessionCookie()`** — kecuali satu
  penambahan yang dibahas terpisah di §5.3 (T-3) dan harus diputuskan sadar.
- **Taksonomi peran** di `lib/constants.ts`. Tidak ada peran baru, tidak ada yang dihapus.
- **Model kolaboratif per-modul** (AUTHZ-02/V5). Ini mengatur pintu, bukan membuat data
  jadi milik per-orang.
- **Desain visual.** Token warna, `PrimaButton`, `confirmDialog`, tooltip — semua
  mengikuti `docs/design/DESIGN-SYSTEM.md` apa adanya.
- **Panel Kelola User & User Management tetap dua panel berbeda** (CLAUDE.md eksplisit
  melarang menggabungkannya). Yang disatukan aturannya, bukan panelnya.

### NON-GOALS — sengaja tidak dikerjakan
- ❌ **Menu/modul yang dibuat admin lewat UI saat runtime.** Menu baru selalu datang
  bersama deploy kode. Registry statis sudah cukup, dan tabel `app_menu` + routing
  dinamis adalah permukaan serangan yang tidak dibayar oleh manfaatnya.
- ❌ **Izin per-menu untuk semua modul sekaligus.** Kinerja sudah ditolak dengan alasan
  yang masih berlaku (tabel perannya keluar datar — ketujuh peran EDIT di semua menu).
  Menambahkan matriks yang seluruh selnya sama bukan kontrol, cuma layar.
- ❌ **Izin per-panel di Usulan.** Sudah dibatalkan 2026-08-04 dengan alasan yang masih
  berlaku: sebagian besar panel berbagi satu endpoint `/api/usulan?scope=…`, jadi tidak
  ada pintu per-panel untuk ditutup di server; menyembunyikannya cuma keputusan tampilan.
- ❌ **Persetujuan dua orang (maker-checker) untuk perubahan akses.** Berguna, tapi
  organisasinya belum sebesar itu, dan ia menuntut alur notifikasi + status tersendiri.
- ❌ **SSO / LDAP / integrasi kepegawaian.** Di luar lingkup.

---

## 4. Desain

### 4.1 Registry tunggal — `lib/registry/apps.ts`

**DATA MURNI + FUNGSI MURNI.** Tidak mengimpor React, ikon, `next/server`, maupun data
layer — karena ia akan dibaca oleh klien (`menu-client.tsx`), server (guard tiap route),
Zod, dan skrip Node (gate G). Aturan yang sudah berlaku untuk `lib/registry/menu-apps.ts`
dan `lib/blud/peran.ts`, dilanjutkan.

```ts
export type Modul = {
  /** = users.app_access value = APP_CARDS.id = suffix app_status_*. Satu nama, satu arti. */
  key: string
  label: string
  href: string
  /** Peran yang otomatis punya pintu ini, tanpa grant. = *_ALLOWED_ROLES hari ini. */
  peranBawaan: readonly string[]
  /**
   * true = semua yang sudah login boleh masuk (Usulan Kebutuhan; pembagian di dalamnya
   * urusan getPanels). Kalau true, `peranBawaan` tidak dibaca.
   */
  terbukaUntukSemua?: boolean
  /**
   * Sakelar pemeliharaan. `null` = modul ini memang tidak punya sakelar — dan itu
   * pernyataan yang harus ditulis, bukan disimpulkan dari ketiadaan.
   * Sub-sakelar (mis. blud_realisasi) hidup di `subSakelar`.
   */
  sakelar: string | null
  subSakelar?: readonly { key: string; label: string }[]
  /** Direktori route API — dipakai gate G untuk memeriksa sakelarnya benar dipasang. */
  dirApi: string | null
  /** Punya pengaturan izin per-menu? Isinya tetap dari `menu-apps.ts` (§4.4). */
  punyaMenu?: boolean
  /** Kata kunci navigasi RIMA. */
  alias?: readonly string[]
}
```

Sepuluh simpul: `dashboard`, `usulan_aset`, `blud`, `perjanjian_kinerja`,
`rencana_aksi`, `new_econtrolling`, `buku_besar_aset`, `lkjip`, `iki`, `admin`.

`admin` masuk sebagai simpul **dengan penanda khusus** (`hanyaPeran: ['SUPER_ADMIN']`)
supaya kartunya tetap lahir dari registry, tapi kuncinya **dikeluarkan** dari
`AppAccessKeyEnum` — menutup T-9 dengan menyebut alasannya di satu tempat, bukan
menghapus diam-diam.

### 4.2 Satu aturan pintu, bukan delapan salinan

Kedelapan `is*Role` hari ini **identik bentuknya**, sudah saya periksa satu per satu:

```ts
export function isXRole(role, appAccess) {
  if (X_ALLOWED_ROLES.includes(role)) return true
  return Array.isArray(appAccess) && appAccess.includes(X_APP_KEY)
}
```

`isBludRole` · `isKinerjaRole` · `isPkRole` · `isAsetRole` · `isLkjipRole` ·
`isRencanaAksiRole` · `isIkiRole` · `isDashboardRole` — delapan berkas, satu kalimat.

Jadi registry bisa memilikinya:

```ts
export function bolehMasukModul(key: string, role: string, appAccess: string[] | null): boolean
```

dan tiap `is*Role` jadi **satu baris re-export**. Nol perubahan perilaku (dijamin uji
tabel-kebenaran, §7), dan mulai saat itu `APP_CHECKS` tidak bisa lagi ketinggalan satu
modul — karena tidak ada lagi `APP_CHECKS`.

**Yang TIDAK ikut**: `isPkEditRole`. Ia beda bentuk (ADMIN_KABAG sengaja tetap baca-saja
walau di-grant) dan menjawab pertanyaan lain — bukan "boleh masuk", melainkan "boleh
mengubah". Tetap di `pk-schemas.ts`. Menyeretnya ke registry akan melahirkan sumbu kedua
yang setengah jadi.

**`*_ALLOWED_ROLES` tetap di-export dari berkas lamanya** (re-export dari registry),
supaya pemakai lain tidak ikut disentuh. Menghitung dan memindahkannya adalah pekerjaan
Fase B, bukan asumsi.

### 4.3 Sakelar: satu daftar, dan penjaganya diturunkan dari daftar itu

`APP_KEYS` (server), `APP_STATUS_LABELS` (layar), dan `MODUL` (gate G) semuanya jadi
turunan `sakelar`/`subSakelar`/`dirApi` di registry.

Yang menutup T-1 secara permanen bukan menambahkan tiga panggilan `modulMati()` — itu
cuma menutup tiga yang ketahuan hari ini. Yang menutupnya adalah:

> **Gate G memindai `dirApi` dari registry, bukan daftarnya sendiri.** Modul yang punya
> `sakelar` tapi route-nya tidak memanggil penjaga = CI merah. Modul yang memang tidak
> punya sakelar wajib menulis `sakelar: null` — pernyataan sadar, dan gate melewatinya
> tanpa mengeluh.

Dengan begitu modul ke-sebelas tidak bisa lahir dengan sakelar hiasan.

Konsekuensi yang harus diterima: **tiga modul akan berubah perilaku** setelah pagar
dipasang. `usulan_aset`, `perjanjian_kinerja`, `dashboard` yang selama ini "sakelarnya
tidak berpengaruh" jadi berpengaruh. Kalau di server kantor salah satunya kebetulan sudah
bernilai `maintenance` (mis. pernah dicoba lalu dilupakan), modulnya akan **mati saat
deploy**. Karena itu langkah pertama Fase A adalah membaca `app_config` di server kantor:

```sql
SELECT `key`, value FROM app_config WHERE `key` LIKE 'app_status_%';
```

### 4.4 Izin per-menu: tidak diubah, cuma dijangkau lebih baik

`lib/registry/menu-apps.ts` sudah benar dan tidak disentuh selain satu hal: `MENU_APPS`
disandingkan dengan simpul registry lewat `key` yang sama, dan `punyaMenu` di §4.1
diturunkan darinya (bukan ditulis ulang).

Yang berubah cuma jangkauannya: tombol MENU muncul untuk **setiap modul yang punya
`menus`** dan yang pintunya terbuka untuk orang itu — menutup T-4. Syarat `punyaBlud()`
dibuang.

### 4.5 Layar: Pusat Akses — satu orang, satu halaman

Tab baru di Admin Panel, menggantikan alur "cari orang → tombol ATUR → modal → tutup →
tombol MENU → modal lain".

```
┌ PUSAT AKSES ─────────────────────────────────────────────────────────┐
│ [cari nama/username]              │  ▸ IDENTITAS                      │
│ ─────────────────────────────     │    budi.s · Budi Santoso          │
│  ● budi.s      PROGRAM     AKTIF  │    Peran: PROGRAM      [ubah]     │
│    sari.w      KEUANGAN    AKTIF  │    Status: AKTIF · 2 sesi aktif   │
│    joko.p      UMUM      NONAKTIF │    Login terakhir: 08/09 07:41    │
│    …                              │    [reset kata sandi] [nonaktif]  │
│                                   │                                   │
│                                   │  ▸ PINTU MODUL          (10)      │
│                                   │    Dashboard    ✗ tertutup        │
│                                   │    Usulan       ✓ terbuka utk semua│
│                                   │    BLUD         ✓ diberi akses  ☑ │
│                                   │      └ menu: 12 · 2 perkecualian ▸│
│                                   │    Perj. Kinerja ✓ karena peran   │
│                                   │      └ menu: 7 · ikut bawaan    ▸ │
│                                   │    E-Anggaran   ✗ tertutup      ☐ │
│                                   │    …                              │
│                                   │                                   │
│                                   │  ▸ [ Lihat sebagai orang ini ]    │
└──────────────────────────────────────────────────────────────────────┘
```

Empat keputusan bentuk, masing-masing menutup satu kebingungan nyata:

**(a) Tiap baris modul menyebut SEBABNYA, bukan cuma keadaannya.** Hari ini modal "Atur
Akses Aplikasi" menampilkan sepuluh centang tanpa membedakan "terbuka karena perannya"
dari "terbuka karena diberi akses" — jadi mencabut centang pada seorang ADMIN terlihat
seperti menutup pintu, padahal tidak menutup apa-apa (`ADMIN` ada di `peranBawaan`
delapan modul). Layar yang menampilkan hasil tanpa sebab melatih orang mengambil
kesimpulan yang salah. Baris berbunyi **"terbuka karena peran ADMIN — mencabut centang
tidak menutupnya"**, dan kotaknya dimatikan.

**(b) Menu ber-indent di bawah modulnya, bukan modal terpisah.** Ia memang anak dari
pintu modulnya: menu yang diatur untuk orang yang pintunya tertutup tidak berarti apa-apa.
Menampilkannya bersarang membuat urutan itu terlihat.

**(c) "Lihat sebagai orang ini" — pratinjau, bukan penyamaran.** Halaman **baca-saja**
yang menampilkan: kartu apa yang akan ia lihat di `/menu`, menu apa yang terbuka di tiap
modul, dan mana yang abu karena pemeliharaan. Dihitung server dari fungsi yang **sama**
dengan yang dipakai pagar sungguhannya (§4.2 + `izinMenuRegistry`), bukan dari salinan.
Nilainya: admin bisa memverifikasi hasil pengaturannya **tanpa** meminjam akun orang lain
— dan meminjam akun adalah kebiasaan yang paling merusak jejak audit.
**Bukan impersonasi**: tidak ada penggantian sesi, tidak ada token, tidak ada tulis.

**(d) Semua aksi akun ada di halaman yang sama.** Ubah peran, reset kata sandi,
nonaktifkan, hapus, unlock promosi, revoke probation — hari ini tersebar antara baris
tabel dan lima modal. Satu orang = satu halaman = satu jawaban untuk "apa yang bisa
dilakukan orang ini".

### 4.6 Tab Peran (matriks) — yang sudah ada, diperluas

`MenuAccessRoleTab` tetap. Yang bertambah: **kolom pintu modul** di atas kolom menu,
supaya pertanyaan "peran KEUANGAN sebenarnya bisa masuk ke mana saja" punya jawaban di
layar, bukan cuma di `*_ALLOWED_ROLES` yang tersebar di delapan berkas.

Baris peran **tidak** memberi akses — itu tetap `app_access` per orang; matriks peran
mengatur izin **di dalam** modul. Perbedaan ini sudah ditulis di
`MenuAccessPanel.tsx` dan harus tetap terbaca di layar baru.

Ditambah dua angka yang sudah ada datanya tapi belum ditampilkan bersama: **jumlah
pemegang peran aktif** dan **kuotanya**.

---

## 5. Perbaikan yang berdiri sendiri (tidak menunggu registry)

### 5.1 T-2 — peran disegarkan lewat keepalive, sesinya tidak dicabut

**Diputuskan ulang 2026-09-09** (§9-2). Rancangan pertama — mencabut sesi di transaksi
yang sama dengan `UPDATE users SET role`, persis `revokeProbation` — **dibatalkan**:
melempar orang ke `/login` di tengah pengisian terlalu mahal untuk kejadian yang tidak
mendesak.

Gantinya: `POST /api/auth/keepalive` berhenti menandatangani ulang payload lama. Ia
membaca `role` **segar dari DB**, lalu menerbitkan token dengan peran itu.

Tiga hal yang membuat ini murah, bukan sekadar lebih sopan:

1. **Nol query tambahan.** Route-nya sudah menanyakan `user_sessions` untuk `session_id`
   yang sama; peran ikut menumpang lewat `JOIN users`. Bandingkan dengan menaruh
   pemeriksaan peran di `getSession()` — God Node yang jalan di **setiap** route.
2. **Tidak ada yang keluar.** Sesinya tetap hidup; yang berganti isinya. Kalau peran
   barunya tidak berhak atas halaman yang sedang dibuka, `proxy.ts` memulangkannya ke
   `/menu` — bukan `/login`, jadi tidak ada yang mengetik sandi ulang.
3. **Cepat.** Klien mengirim keepalive ~1 menit sekali (komentar SDL-M17 di route-nya),
   jadi peran baru berlaku dalam hitungan menit — bukan sampai akhir hari kerja.

**Gagal baca DB tetap 401 — rencana "perpanjang saja" DIBATALKAN saat dikerjakan
(2026-09-09).** Rancangan ini semula menulis "sesi orang tidak boleh mati karena MySQL
tersendat sedetik". Begitu kodenya ditulis, ternyata itu tidak bisa dilakukan tanpa
melonggarkan hal lain: kueri yang membaca peran ADALAH kueri yang memeriksa
`user_sessions.invalidated_at`, dan yang kedua fail-closed sejak awal. Membuatnya
fail-soft berarti sesi yang **sudah dicabut** ikut bertahan hidup setiap kali MySQL
tersendat — menukar ketidaknyamanan dengan lubang. Jadi perilaku 401-nya dibiarkan
persis seperti sebelum A2; yang fail-soft cuma perannya (token legacy tanpa `sessionId`
memakai peran lama apa adanya).

Satu hal harus disebut terus terang, karena ia yang menentukan besar-kecilnya risiko:
**selama tokennya masih memuat peran lama, wewenangnya juga masih peran lama.**
`requireRole` menilai dari `session.role` (`lib/security/guard.ts:34`), dan
`hasAppAccess` memutus di `check(role, null)` sebelum menyentuh DB (`:47`) — keduanya
percaya token. Jadi jendela itu bukan sekadar menu yang tampil keliru; wewenangnya
memang masih hidup. Yang membuatnya bisa diterima cuma **panjangnya**: ~1 menit, turun
dari sampai-akhir-hari-kerja seperti hari ini.

Dan kalau suatu saat ada kasus yang tidak boleh menunggu semenit pun — orang dipecat
mendadak, akun dicurigai — jalan keluarnya sudah ada tanpa perlu mengubah rancangan ini:
**nonaktifkan akunnya**, yang memang mencabut sesi saat itu juga (§5.3). Ganti peran
memilih jalur yang sopan; memutus seketika tetap tersedia lewat tombol yang memang untuk
itu.

**Nonaktif tetap memutus seketika** (§5.3). Bedanya disengaja: "perannya berubah" boleh
menunggu semenit, "orang ini tidak boleh masuk lagi" tidak.

### 5.2 T-7 — kuota diperiksa saat mengaktifkan kembali

`assertQuotaAvailableTx(role, tx)` di dalam `withTransaction` yang sama dengan
`UPDATE users SET status='AKTIF'`. Pola sudah ada di `action='ubah-role'`; yang dilakukan
cuma memakainya di pintu keempat. Pesannya sama: 409 + "kuota role X penuh".

CLAUDE.md §Role Quota ikut diperbaiki: **empat** entry point.

### 5.3 T-3 — status akun diperiksa saat sesi dipakai

Dua bagian, dan keduanya perlu:

1. **`action='nonaktif'` mencabut sesi** — sama seperti §5.1. Ini yang menutup kasus
   nyatanya.
2. **`getSession()` ikut memeriksa `users.status`** — jaring pengaman untuk jalur lain
   yang mengubah status tanpa lewat route admin (cron, perbaikan manual di DB).

Bagian 2 menyentuh God Node, jadi harus dibayar sadar: `getSession()` **sudah**
mengeksekusi satu query ke `user_sessions` saat `sessionId` ada. Pemeriksaan status bisa
menumpang query itu (`JOIN users`) — **nol query tambahan**. Kalau ternyata tidak bisa
digabung bersih, bagian 2 ditunda dan hanya bagian 1 yang dikerjakan; menambah satu query
per request bukan harga yang sepadan untuk jaring pengaman.

Fail-closed mengikuti perilaku yang sudah ada di sana: DB bermasalah = sesi ditolak.

### 5.4 T-8 — satu aksi, satu tingkat kehati-hatian

`KelolaUserPanel` tetap panel ubah-peran (CLAUDE.md melarang menggabungkannya dengan User
Management, dan pemilik aplikasi menyatakan panel ini memang dibutuhkan). Yang berubah:
dropdown-nya memakai **komponen yang sama** dengan Admin Panel — penanda kuota `(n/max)`,
opsi penuh dimatikan, `confirmDialog` sebelum menyimpan, dan peringatan perkecualian menu
+ probation.

Satu komponen, bukan dua salinan kalimat: dua salinan pasti berbeda bunyi begitu salah
satu disunting (pelajaran L78, sudah tiga kali terjadi di modul BLUD).

### 5.5 T-12 — hapus akun: nonaktif permanen dulu, hapus keras belakangan

Tombol HAPUS diganti dua pilihan yang jujur menyebut bedanya:

| Pilihan | Yang terjadi | Untuk |
|---|---|---|
| **Arsipkan** (bawaan) | `status='NONAKTIF'` + `deleted_at=NOW()` + sesi dicabut; PII dianonimisasi oleh cron retensi setelah 5 tahun | pegawai pindah/berhenti — jejak "siapa menyimpan apa" tetap utuh |
| **Hapus permanen** | `DELETE FROM users` seperti hari ini | akun uji / salah ketik yang belum pernah menyimpan apa pun |

"Hapus permanen" menampilkan lebih dulu **berapa baris yang akan kehilangan
kepemilikannya** (`rekap_pk.saved_by`, `menu_*_access.updated_by`) — dihitung, bukan
diperingatkan secara umum. Nol adalah jawaban yang paling sering, dan justru itu yang
membuat angkanya berguna: ketika ia bukan nol, orangnya berhenti.

Akun ber-`deleted_at` disembunyikan dari daftar kecuali penyaring "termasuk yang
diarsipkan" dinyalakan.

---

## 6. Fase eksekusi

> **Rincian, bukan urutan.** Urutan kerja yang berlaku ada di **§17**; bagian ini
> menjelaskan isi tiap fase Bagian I. Kalau keduanya kelihatan berbeda, §17 yang menang.

Berurutan. Fase B **tidak boleh mengubah perilaku sama sekali** kecuali yang disebut
eksplisit.

### Fase A — perbaikan keamanan yang tidak menunggu apa-apa
Dikerjakan lebih dulu karena tidak bergantung registry dan akibatnya paling langsung.

- [ ] **A0** — baca `app_config` di server kantor (§4.3) **sebelum** memasang pagar.
- [ ] **A1** (T-1) — `modulMati()`/`modulSedangMati()` di Usulan, PK, Dashboard —
      halaman **dan** tiap route. Pengecualian `PERAN_TEMBUS_SAKELAR` ikut, supaya yang
      mematikan tetap bisa memeriksa (S1/N4).
- [ ] **A2** (T-2) — keepalive membaca peran segar dari DB (`JOIN users`); sesi
      **tidak** dicabut saat ubah peran (§5.1, keputusan §9-2).
- [ ] **A3** (T-3) — nonaktifkan mencabut sesi; `getSession()` menumpang query yang ada.
- [ ] **A4** (T-7) — kuota di jalur `aktifkan`.
- [ ] **A5** (T-5) — `app_status_blud_realisasi` masuk daftar label (satu baris; sisanya
      dibereskan Fase B).
- [ ] **A6** (T-6) — `dashboard` masuk `APP_CHECKS` (satu baris; idem).
- **DoD**: `npx tsc --noEmit` + ESLint bersih; 7 gate CI hijau; diverifikasi **di
  peramban** sebagai SUPER_ADMIN dan sebagai satu akun uji berperan sub-bidang —
  mematikan sakelar Usulan lalu **mengetik URL-nya langsung** harus mendarat di
  `/maintenance`, bukan di aplikasi; menurunkan peran akun uji yang sedang login harus
  membuatnya **tetap masuk** dengan peran baru berlaku setelah keepalive berikutnya —
  kalau ia mendarat di `/login`, A2 salah pasang.

### Fase B — registry tunggal (perilaku identik)
- [ ] **B1** — `lib/registry/apps.ts` (§4.1), 10 simpul, data murni.
- [ ] **B2** — `bolehMasukModul()` + kedelapan `is*Role` jadi re-export (§4.2).
- [ ] **B3** — delapan daftar §2 diturunkan dari registry; `APP_CHECKS` **hilang**.
- [ ] **B4** — `admin` keluar dari `AppAccessKeyEnum` (T-9), dengan komentar sebabnya.
- [ ] **B5** — gate G memindai `dirApi` dari registry (§4.3). **Ini yang paling penting
      di seluruh fase ini** — tanpanya, Fase A cuma menambal tiga lubang yang ketahuan.
- [ ] **B6** — `NAV_MODULES` (T-11) & `module-menus.ts` (T-10) diturunkan: daftar modul
      dari registry, daftar menu dari `MENU_APPS`/`peran.ts`. Modul yang menu-nya belum
      terdaftar di registry menu (Renaksi, LKJIP, BBA, IKI, Kinerja) tetap memakai daftar
      tulisan tangan **yang diberi komentar kenapa** — dan itu batas jujur Fase B.
- **DoD**: nol perubahan visual; tabel kebenaran `bolehMasukModul` × 27 peran × 10 modul
  **identik** dengan `is*Role` lama (§7); grant/revoke & sakelar berperilaku sama.

### Fase C — layar Pusat Akses
- [ ] **C1** — tab baru + daftar orang + panel identitas (§4.5 a–d).
- [ ] **C2** — baris pintu modul yang menyebut sebab; menu ber-indent (menutup T-4).
- [ ] **C3** — "Lihat sebagai orang ini" (baca-saja, dihitung server).
- [ ] **C4** — Tab Peran diperluas kolom pintu + jumlah pemegang & kuota (§4.6).
- [ ] **C5** (T-12) — Arsipkan vs Hapus permanen (§5.5).
- [ ] **C6** — jenis peristiwa audit sendiri: `ACCESS_GRANT` / `ACCESS_REVOKE` /
      `ROLE_CHANGE`, menggantikan `USER_UPDATE` yang hari ini menampung semuanya
      sehingga "siapa memberi akses apa bulan lalu" tidak bisa disaring.
- **DoD**: tab lama tetap berfungsi selama transisi; tiap aksi menulis audit dengan
  bentuk sebelum→sesudah; diverifikasi di peramban dengan minimal 3 akun uji berbeda
  peran.

### Fase D — Usulan Kebutuhan
- [ ] **D1** (T-8) — dropdown peran memakai komponen bersama (§5.4).
- [ ] **D2** — spanduk penjelas di panel: apa yang bisa & tidak bisa dilakukan di sini,
      dengan tautan ke Pusat Akses. Kalimatnya menyebut **tombol yang memang ada di layar
      tujuan** (L79d).
- **Yang TIDAK dikerjakan**: izin per-panel. Alasan pembatalan 2026-08-04 masih berlaku.

### Fase E — modul lain, kalau memang dibutuhkan
- [ ] **E1** — inventaris menu Renaksi / LKJIP / BBA / IKI dalam bentuk `peran.ts` daun,
      **hanya untuk modul yang perannya benar-benar berbeda**. Tabel peran yang keluar
      datar = modul itu tidak membutuhkannya (pelajaran Kinerja), dan menuliskannya tetap
      berarti melahirkan matriks hiasan.
- [ ] **E2** — Kinerja **tetap ditolak** untuk izin per-menu. Yang ia dapat dari konsep
      ini cuma pintu & sakelar yang benar — dan itu memang yang kurang.

---

## 7. Uji regresi yang wajib lahir bersamanya

Pola yang sudah terbukti di modul BLUD & E-Anggaran: uji **perilaku** dengan pembanding,
bukan pencocokan teks; lalu **uji mutasi** — rusak satu aturan, pastikan ada yang gagal.

| Berkas | Menjaga |
|---|---|
| `scripts/test-registry-akses.mts` (baru) | tabel kebenaran `bolehMasukModul` × 27 peran × 10 modul **sama persis** dengan kedelapan `is*Role` sebelum refactor (snapshot dibekukan di Fase B sebelum kode lama dihapus) |
| `scripts/test-killswitch-modul.mjs` (diperluas) | daftar modulnya **diturunkan dari registry**, bukan ditulis tangan; modul ber-`sakelar` yang route-nya tidak menjaganya = gagal |
| `scripts/test-sesi-dicabut.mts` (baru) | seluruh A1–A7. Sakelar dihitung **per handler**, bukan per berkas (gate G lolos kalau pagarnya cuma di GET); guard meneruskan `role` (PERAN_TEMBUS_SAKELAR); keepalive menerbitkan token berperan **dari DB**; `getSession` menumpang kueri revokasi lewat JOIN; login & sesi memakai SATU aturan status; nonaktif = satu transaksi; `aktifkan` memeriksa kuota; lantai A7 dibaca sebelum aksi apa pun, dan `GET`+`ubah-role` TETAP terbuka |
| `scripts/test-menu-access.mjs` (ada) | tidak boleh mundur |
| `npm run check:tokens` (gate E) | warna baru di layar Pusat Akses wajib token yang sudah ada |

Tiga jebakan uji yang sudah memakan korban di sesi-sesi sebelumnya dan **wajib**
dihindari di sini:

- **L82c** — kutipan sepotong. Memeriksa `/status === 'AKTIF'/` akan cocok juga dengan
  baris tetangganya; kutip utuh sampai kurung buka, dan **hitung kemunculannya**.
- **Prosa menyalakan tesnya sendiri.** Komentar yang menjelaskan bug lama memuat teks
  yang dicari pemeriksaan "tidak boleh ada lagi". Buang komentar dulu.
- **Jendela pemeriksaan menjulur ke fungsi lain.** Potong per badan fungsi, bukan per
  jumlah karakter.

---

## 8. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Sakelar yang selama ini tidak menjaga tiba-tiba menjaga** (T-1) | Modul mati saat deploy kalau nilainya kebetulan `maintenance` | A0 wajib: baca `app_config` di server kantor lebih dulu |
| **Peran di token sempat basi** (≤ ~1 menit, §5.1) | Wewenang lama **masih benar-benar berlaku** selama jendela itu — `requireRole`/`hasAppAccess` menilai dari token, bukan DB | Jendelanya dipersempit dari sampai-akhir-hari-kerja jadi ~1 menit; untuk kasus yang tidak boleh menunggu, nonaktifkan akunnya — itu mencabut sesi seketika |
| **`getSession()` disentuh** (§5.3 bagian 2) | Seluruh aplikasi terdampak | Menumpang query yang sudah ada; kalau tidak bisa bersih → ditunda, hanya pencabutan sesi yang dikerjakan |
| **Refactor `is*Role` menggeser satu sel** | Satu peran diam-diam kehilangan/mendapat modul | Tabel kebenaran dibekukan **sebelum** kode lama dihapus (§7 baris 1) |
| **Registry menumbuhkan daftar ke-sembilan** | Penyakit §2 lahir kembali | Tiap daftar turunan wajib `derive`, tidak boleh mengetik ulang; diuji dengan menghitung kemunculan |
| **`app_access` bentuknya ikut diubah** | God Node `hasAppAccess()` terdampak | Dikunci di §3 "Yang TIDAK berubah" |
| **Pusat Akses jadi jalan menembus pemisahan tugas** — mis. Tutup Kas dicentang untuk bendahara | Kontrol internal keuangan hilang | Pagar atas tetap: `bolehBukaPeriode`, `canHapusVersi`, `LANTAI_EDIT` **tidak membaca tabel izin sama sekali**. Tidak berubah dari `CONCEPT-menu-access-control.md` §4.5.4 |
| **Admin mengunci dirinya sendiri** | Tidak ada yang bisa membetulkan | Baris SUPER_ADMIN tetap tidak bisa diatur; `app_access: null` dipertahankan |
| **"Lihat sebagai orang ini" berubah jadi impersonasi** | Jejak audit rusak — kebiasaan terburuk yang mau dicegah fitur ini | Baca-saja, nol tulis, nol penggantian sesi. Dikunci uji |

### Batas jaminan
Ini **kontrol akses internal antar pegawai**, bukan pertahanan terhadap penyerang luar.
Tidak ada endpoint publik baru; seluruh permukaan tetap di balik `getSession()`.
Pertahanan luar tetap dari lapis yang sudah ada: JWT + revocation, lockout login atomik
(V3-5/L55), rate limit, CSP nonce, security headers, 7 gate CI.

---

## 9. Keputusan — semuanya sudah diambil (2026-09-09)

Keenamnya dijawab pemilik aplikasi. Ditulis di sini sebagai catatan yang mengikat, bukan
lagi sebagai pertanyaan.

1. **Siapa boleh membuka Pusat Akses? → SUPER_ADMIN saja.**
   Alasan pemilik aplikasi: *"admin staff itu seperti pengawas yang diperbolehkan
   membuka semua akses aplikasi kecuali modul admin panel."* Rekomendasi saya sebelumnya
   (membuka untuk ADMIN dengan lantai yang sudah berlaku di API) **dibatalkan** — ADMIN
   mengawasi isi aplikasi, bukan mengatur siapa boleh masuk.

   Dua akibatnya harus **dikerjakan**, bukan sekadar dicatat:
   - **T-16 masuk Tahap 1** — tiga aksi yang hari ini bisa dipanggil ADMIN tanpa punya
     layarnya dipersempit ke SUPER_ADMIN. `GET` + `ubah-role` **tetap** terbuka, karena
     Kelola User di Usulan berdiri di atasnya.
   - **Di Pusat Akses, baris modul untuk akun ADMIN ditandai "terkunci — dapat dari
     peran".** Ini bukan pilihan tampilan: `hasAppAccess` memanggil `check(role, null)`
     lebih dulu (`lib/security/guard.ts:47`) dan tiap `is*Role` memuat `ADMIN`, jadi
     mencabut centangnya **tidak menutup apa pun**. Kotak centang yang bisa dicabut tapi
     tidak berefek persis kebohongan yang kolom "sebab" di §4.5 dibuat untuk
     membongkarnya — dan kasusnya ternyata bukan hipotetis.

2. **Nonaktifkan → langsung terputus. Ubah peran → tidak mengusir siapa pun.**
   Diubah 2026-09-09, dari "dua-duanya langsung terputus".
   - **Nonaktifkan**: sesinya dicabut saat itu juga, dan `getSession` ikut memeriksa
     `users.status` (§5.3).
   - **Ubah peran**: tidak ada yang dilempar ke `/login`. Perannya disegarkan lewat
     `keepalive` yang membaca DB (§5.1), jadi berlaku dalam hitungan menit tanpa
     siapa pun keluar dan tanpa isian yang belum tersimpan hilang.

   Satu angka yang saya sebut sebelumnya perlu dibetulkan, dan pembetulannya justru
   mendukung pilihan ini: peran lama **tidak** bertahan 7 hari. Tujuh hari itu ceiling
   teoretis — yang mengikat lebih dulu token 8 jam, idle 60 menit, dan server yang
   dimatikan tiap malam, jadi batas nyatanya akhir hari kerja (rinciannya di T-2).
   Dengan penyegaran di keepalive, tinggal hitungan menit.

3. **Hapus permanen tetap disediakan? → ya, tapi bukan bawaan** (§5.5), dan menampilkan
   berapa jejak yang akan kehilangan pemiliknya.

4. **"Lihat sebagai orang ini" → paling akhir di Tahap 5**, dan yang pertama dicoret
   kalau waktunya habis.

5. **Revamp → persis seperti maketnya, kedua tema.**
   `docs/design/revamp-admin-pusat-akses.html` naik status dari usulan menjadi **acuan
   yang mengikat**. Ia memakai emas `#EF9F27 → #FAC775` di mode gelap dan ungu-merah
   muda `#8B5CF6 → #EC4899` di mode terang — jadi jawaban ini **sekaligus melepas sian
   `#00D4FF`**, dan sian tidak jadi token resmi. Maketnya sudah dibuktikan memakai 36
   hex yang semuanya sudah ada di `DESIGN-SYSTEM.md` (nol hex baru), jadi arah ini yang
   membuat baseline gate E **turun**, bukan bertambah.

6. **Sejauh mana Bagian II diambil? → Putaran 1 penuh (Tahap 0–6, nol migration)**, lalu
   dinilai ulang setelah layarnya dipakai seminggu.

---

## 10. Berkas yang akan tersentuh (perkiraan)

**Baru**: `lib/registry/apps.ts` · `app/(dashboard)/admin/_panels/PusatAksesPanel.tsx` ·
`scripts/test-registry-akses.mts` · `scripts/test-sesi-dicabut.mts`

**Diubah**: `app/api/admin/users/route.ts` · `app/api/admin/app-status/route.ts` ·
`app/api/user/access/route.ts` (kemungkinan besar **dihapus** — jawabannya jadi turunan
registry) · `lib/data/admin-schemas.ts` · `lib/security/auth.ts` (§5.3, kalau bisa
bersih) · `app/(dashboard)/admin/_panels/{_shared,TabUserMgmt,TabAppControl,MenuAccessPanel}.tsx` ·
`app/(dashboard)/menu/menu-client.tsx` · `app/(dashboard)/usulan-kebutuhan/{page,usulan-client}.tsx` ·
`app/(dashboard)/usulan-kebutuhan/_panels/KelolaUserPanel.tsx` ·
`app/(dashboard)/perjanjian-kinerja/layout.tsx` · `app/(dashboard)/dashboard/page.tsx` ·
`app/api/{usulan,perjanjian-kinerja,dashboard}/**/route.ts` (pagar sakelar) ·
delapan berkas `*-schemas.ts` (re-export `is*Role`) · `lib/sentinel/{nav,module-menus}.ts` ·
`scripts/test-killswitch-modul.mjs` · `CLAUDE.md` (T-13 + entry point kuota)

**Bagian I: nol migration, nol tabel baru, nol kolom baru.** Satu-satunya kemungkinan
penambahan kolom adalah kalau keputusan §9.3 berubah — dan `users.deleted_at` sudah ada.
Biaya Bagian II dirinci terpisah di §15, dan sebagian besarnya juga nol.

---
---

# BAGIAN II — PENGEMBANGAN

Bagian I membuat yang ada jadi benar dan jadi satu. Ia belum membuat Admin Panel jadi
tempat yang **menyelesaikan pekerjaan**. Bagian ini yang mengerjakannya.

Urutannya bukan urutan kerja — itu di §15. Ini urutan menurut seberapa sering
pekerjaannya muncul dalam sehari-hari.

---

## 11. Lima aturan yang mengikat semua yang di bawah

Ditulis di depan karena tiap kemampuan di §12 akan diuji terhadap kelimanya, dan karena
kelimanya sudah dibayar mahal di modul lain.

**11.1 Berhenti di form, bukan di jalur tulis baru.** Fitur yang mengubah wewenang
sedapat mungkin **mengisi layar** yang sudah ada lalu ditulis oleh tombol Simpan yang
sudah ada — bukan membuat endpoint tulisnya sendiri. Alasannya bukan kerapian: endpoint
tulis kedua = set aturan kedua, dan itu sudah tiga kali melahirkan lubang nyata di BLUD
(L78 impor menerima dokumen historis yang ditolak Simpan; L80; L82). Di sini artinya:
Paket Akses (P1), Pulihkan (P8), dan Terapkan Tinjauan (P3) **tidak** punya route tulis
sendiri — semuanya lewat jalur simpan Pusat Akses.

**11.2 Menyembunyikan bukan menjaga.** Tiap sakelar, kotak centang, dan lencana baru
wajib punya pagar di server. Kalau pagarnya belum ada, **tombolnya tidak dibuat**. T-1
lahir persis dari melanggar ini, dan ia bertahan berbulan-bulan.

**11.3 Layar menyebut sebab, bukan cuma keadaan.** "Terbuka karena peran ADMIN",
"berakhir 30 Sep", "berasal dari paket Bendahara, 2 hal sudah diubah". Keadaan tanpa
sebab melatih orang menyimpulkan yang salah — itu inti T-6 dan seluruh §4.5(a).

**11.4 Gesekan diletakkan di tempat yang merusak, bukan di tempat yang sering.**
Konfirmasi ketikan, alasan wajib, dan dialog panjang untuk: ubah peran, cabut akses,
hapus permanen, ubah matriks peran. **Tidak** untuk: aktifkan/nonaktifkan rutin,
menyetujui permintaan akses satu modul. Gesekan berat pada aksi harian melatih orang
menembusnya, dan orang yang terlatih menembus akan menembus juga yang berbahaya
(pelajaran L76 dan §8 cadangan BLUD).

**11.5 Satu daftar, banyak pembaca — termasuk penjaganya.** Tiap daftar turunan
di-`derive`, tidak diketik ulang; uji regresi **menghitung kemunculan**, bukan mencari
keberadaan. Ini yang membedakan Bagian I dari tambalan.

---

## 12. Dua belas kemampuan

Format tiap butir: **masalahnya** (yang nyata, bukan yang dibayangkan) · **bentuknya** ·
**kenapa bentuk itu** · **batas & biaya**.

### P1 · Paket Akses — memberi akses sekali klik, tanpa menjadikannya ikatan hidup

**Masalah.** Memberi akses ke pegawai baru hari ini = mencentang 9 kotak, lalu membuka
modal MENU untuk BLUD, lalu untuk PK, lalu menebak-nebak. Diulang tiap orang. Dan tidak
ada satu tempat pun yang menjawab pertanyaan yang seharusnya paling mudah: **"bendahara
pengeluaran seharusnya dapat apa?"** Jawabannya hari ini hidup di kepala satu orang.

**Bentuk.** Paket bernama = daftar modul + peta izin menu. Mis. "Bendahara Pengeluaran" =
`blud` (menu: Buku Kas EDIT, Realisasi EDIT, Tutup Kas EDIT, sisanya LIHAT) + `dashboard`.
Di Pusat Akses: tombol **"Terapkan paket…"** → memilih paket **mengisi form**, admin
melihat hasilnya, menyunting kalau perlu, lalu Simpan.

**Kenapa bentuk itu.** Paket **bukan** ikatan permanen. Kalau ia jadi acuan hidup,
menyunting satu paket diam-diam mengubah wewenang belasan orang sekaligus — dan itu
persis risiko yang sudah terdaftar di `CONCEPT-menu-access-control.md` §8 ("matriks peran
diedit sembarangan"). Sebagai titik awal, ia memberi 90% manfaatnya dengan 0% risiko itu.
Layar tetap mencatat asal-usulnya (`berasal dari paket X · 2 hal diubah`) — pola
`asal_salin`/`asal_pulihkan` yang sudah dipakai enam kali di BLUD, dan yang membuat audit
bisa menjawab "kenapa orang ini dapat ini".

**Batas & biaya.** Nol tabel: paket disimpan sebagai satu baris `app_config`
(`akses_paket`, JSON, divalidasi Zod saat baca **dan** tulis — `value` bertipe TEXT tanpa
bentuk, jadi yang menjaganya cuma Zod). Kalau paketnya tumbuh melewati ±20 atau butuh
riwayat sendiri, barulah pindah ke tabel — dan itu keputusan yang bisa ditunda tanpa
membuang apa pun. Paket **tidak** boleh memuat peran: memberi peran punya kuota,
mencabut sesi, dan membatalkan probation. Itu aksi tersendiri, bukan isi paket.

### P2 · Akses berjangka — yang dipinjam, kembali sendiri

**Masalah.** Akses sementara (pegawai magang, pengganti selama cuti, tim SPI saat
pemeriksaan) diberikan dengan niat "nanti dicabut", dan tidak pernah dicabut. Inilah yang
membuat perintah di CLAUDE.md — *"pemberian `app_access` harus konservatif & direview
berkala"* — sulit dipatuhi: yang menumpuk bukan pemberian yang salah, melainkan
pemberian yang benar yang kelewat umurnya.

**Bentuk.** Saat memberi akses, kolom opsional **"sampai tanggal"** + alasan. Cron harian
mencabut yang lewat, dan mengirim notifikasi ke pemegang **dan** ke admin **3 hari
sebelum** — supaya perpanjangan adalah keputusan, bukan kejutan. Di Pusat Akses barisnya
berbunyi *"terbuka sampai 30 Sep (12 hari lagi)"*.

**Kenapa bentuk itu.** Pencabutan otomatis **wajib** memanggil fungsi pencabutan yang
sama dengan pencabutan manual — bukan `UPDATE app_access` sendiri di dalam cron. Kalau
dua jalur, satu di antaranya akan lupa membersihkan perkecualian menu (L69, dan
pembersihan itu sudah ada di `PATCH set-app-access` hari ini).

**Batas & biaya.** Satu tabel kecil `akses_kedaluwarsa (user_id, app_key, berakhir_pada,
alasan, dibuat_oleh)`. **Tidak** disimpan di `users.app_access` — bentuknya dikunci di §3,
dan menyelipkan tanggal ke dalam larik datar akan menyentuh God Node `hasAppAccess()`.
Satu route cron baru mengikuti pola `purge-retention` (`verifyCronSecret`, dijalankan
MySQL EVENT/crontab — **bukan** `vercel.json`). Peringatan yang berlaku untuk semua cron
di sini: server PRIMA adalah laptop kantor yang dimatikan tiap malam, jadi jadwalnya harus
tahan terlewat — cron memeriksa **"yang sudah lewat"**, bukan "yang jatuh tempo hari ini".

### P3 · Tinjauan Akses Berkala — memenuhi aturan yang sudah ditulis sendiri

**Masalah.** CLAUDE.md (AUTHZ-02/V5) menyatakan akses harus **direview berkala**. Tidak
ada alatnya, tidak ada catatannya, dan karena itu tidak pernah terjadi. Kalau SPI atau
auditor bertanya "kapan terakhir ditinjau", tidak ada jawaban.

**Bentuk.** Layar Tinjauan = tabel **orang × modul** (satu layar, bisa digulir), penyaring
*"belum ditinjau sejak >6 bulan"*, tombol **"Sudah saya tinjau"** per orang yang menyimpan
tanggal + peninjau, dan tombol **cabut** langsung dari baris yang sama. Ekspor Excel untuk
lampiran.

**Kenapa bentuk itu.** Tinjauan yang menuntut membuka 40 halaman satu per satu tidak akan
selesai. Yang membuatnya selesai adalah **satu layar yang bisa dibaca dari atas ke bawah**
dengan aksi di baris yang sama — dan penyaring yang membuat kunjungan kedua hanya
menampilkan yang belum.

**Batas & biaya.** Dua kolom di `users` (`access_reviewed_at`, `access_reviewed_by`).
Sengaja **bukan** tabel riwayat tinjauan: yang dibutuhkan adalah "kapan terakhir", bukan
seluruh sejarahnya — dan jejak lengkapnya toh sudah masuk `audit_log`. Ekspornya memakai
pembangkit Excel yang sudah ada (`addSheetFromAoa`), dan mengikuti aturan yang sudah
mahal dipelajari: **dokumen memuat angka yang persis sama dengan layar** — menerima baris
yang sudah dihitung, bukan menghitung ulang di pengekspor.

### P4 · Permintaan akses mandiri — memindahkan antrean WhatsApp ke dalam aplikasi

**Masalah.** Orang yang butuh akses modul mengirim WhatsApp ke admin. Tidak ada
antreannya, tidak ada alasannya yang tercatat, tidak ada jejak siapa menyetujui — dan
kalau adminnya cuti, tidak ada yang tahu ada yang menunggu.

Preseden di aplikasi ini sudah ada dan lengkap: **Role Promotion Ladder** (ajukan →
setujui → cooldown → probation → revoke). Yang belum punya jalurnya justru permintaan
yang jauh lebih sering dan jauh lebih ringan: **pintu satu modul**.

**Bentuk.** Kartu terkunci di `/menu` dapat tautan kecil **"Minta akses"** → alasan
singkat → masuk antrean di Pusat Akses. Admin menyetujui/menolak dengan satu klik;
pemohon dapat notifikasi (`addNotif`, tabel `notifications` sudah ada). Menyetujui
**mengisi form** pemberian akses (aturan 11.1), tidak menulis langsung.

**Kenapa bentuk itu, dan kenapa TIDAK meniru alur promosi.** Promosi dijaga kata sandi
ulang, cooldown 5 menit, probation 7 hari, dan lock 24 jam setelah 3 kali salah. Itu
sepadan untuk **kenaikan tingkat wewenang**. Untuk membuka satu pintu modul yang
sehari-hari, gesekan sebesar itu melanggar aturan 11.4 — dan yang terjadi bukan keamanan,
melainkan orang kembali ke WhatsApp. Yang tetap ikut: rate limit, audit, dan penolakan
yang **menyebutkan alasannya** ke pemohon.

**Batas & biaya.** Tabel kecil `akses_permintaan`. **Tidak** menumpang tabel promosi:
bentuk datanya beda (sasarannya modul, bukan peran) dan aturannya beda (tanpa cooldown,
tanpa probation). Menumpang berarti dua alur dengan aturan berbeda berbagi satu kolom
status — bentuk yang sudah dijelaskan di L88 sebagai sumber kebingungan.

### P5 · Mode BACA-SAJA — keadaan sakelar ketiga yang paling sering dibutuhkan

**Masalah, dan ini musiman tapi pasti.** Saat tutup buku, penyusunan LKJIP, atau
rekonsiliasi, yang dibutuhkan **bukan** mematikan modul — orang masih harus membuka dan
mencetak. Yang dibutuhkan adalah **membekukan tulisan**. Karena pilihannya cuma
`online`/`maintenance`, yang terjadi hari ini: dibiarkan `online`, lalu diumumkan lewat
grup WhatsApp *"jangan diubah dulu ya"*. Itu bukan kontrol, itu harapan.

**Bentuk.** Nilai ketiga `'readonly'` pada `app_config`. Layar menampilkan lencana
**BEKU** + pesan + sampai kapan; tombol simpan mati dengan alasan yang tertulis.

**Kenapa bisa murah — dan di mana ia berhenti murah.** Untuk modul yang sudah punya izin
per-menu (**BLUD, PK**) ini **hampir gratis**: cukup menjepit hasil `izinMenuRegistry` ke
maksimal `LIHAT` di satu tempat, dan **seluruh pagar EDIT yang sudah ada langsung
menolak** — tidak ada satu route pun yang perlu disentuh. Itu hadiah dari pekerjaan
2026-08-01/08-03 yang selama ini belum ditagih.

Untuk empat modul yang memakai pabrik `buatGuardModul` (**BBA, IKI, LKJIP, Rencana
Aksi**) juga murah: pabriknya menolak metode tulis (POST/PUT/PATCH/DELETE) di satu tempat,
empat modul dapat sekaligus.

Yang **tidak** murah: **Usulan, E-Anggaran, Dashboard** — guard-nya sendiri-sendiri, jadi
per-route. Dan Usulan punya alur status (DIAJUKAN → DITELAAH → DIPUTUSKAN) yang
membekukannya di tengah punya arti tersendiri; itu keputusan domain, bukan sakelar.
**Rekomendasi: kerjakan BLUD+PK+empat modul pabrik, sebut terus terang tiga sisanya belum
dapat.** Sakelar yang berlaku di enam modul dan jujur soal tiga lainnya lebih baik daripada
sakelar yang mengaku berlaku di semua.

**Batas & biaya.** Nol migration (`value` sudah TEXT bebas). Kode balasan **baru**
`MODUL_BACA_SAJA` (503, terpisah dari `MODUL_MATI`) — penerimanya harus bisa membedakan
"sedang dibekukan, membaca tetap boleh" dari "modul mati". Ini pengulangan alasan yang
sama dengan kenapa `modulMati` memulangkan 503 dan bukan 403.

### P6 · Pesan & jadwal pemeliharaan — berhenti membuat orang menebak

**Masalah.** Halaman `/maintenance` cuma berbunyi "Aplikasi sedang dipelihara", dan nama
modulnya diambil dari **query string** (`?app=`) — artinya siapa pun bisa membuka
`/maintenance?app=Apa%20Saja` dan melihat halaman resmi yang menyebut apa pun. Tidak ada
kapan selesainya, tidak ada siapa yang bisa ditanya.

**Bentuk.** Dua kunci `app_config` per modul: `app_status_<key>_pesan` dan
`app_status_<key>_sampai`. Diisi di layar sakelar, ditampilkan di `/maintenance` dan
sebagai spanduk di kartu `/menu`. Nama modul **divalidasi terhadap registry**, bukan
ditampilkan mentah dari URL.

**Batas & biaya.** Nol migration. Kecil, tapi ini yang paling sering menghemat telepon
masuk — dan perbaikan `?app=` menutup satu jalan gampang untuk menipu orang sekantor.

### P7 · Wajib ganti kata sandi pada login pertama

**Masalah, dan ini yang paling tidak nyaman untuk disebut.** SUPER_ADMIN membuat akun
**beserta kata sandinya**, lalu memberitahukannya. "Reset password" juga begitu. Tidak ada
apa pun yang memaksa kata sandi itu berubah. Artinya **untuk setiap akun di sistem ini,
ada dua orang yang tahu kata sandinya, selamanya** — dan setiap tindakan akun itu, secara
teknis, bisa dibantah pelakunya. Untuk aplikasi yang menyimpan angka anggaran dan
menerbitkan dokumen bertanda tangan, itu masalah yang nyata.

**Bentuk.** Kolom `must_change_password` (default 0) + `password_changed_at`. Jalur
create-user dan reset-password menyalakannya. Login yang menemukannya menyala mengarahkan
ke layar ganti kata sandi sebelum apa pun yang lain. Route `change-password` yang sudah
ada dipakai apa adanya — ia bahkan sudah mencabut sesi lain.

**Batas & biaya.** Satu migration dua kolom. **Bawaannya 0** dan hanya jalur baru yang
menyalakannya — kalau tidak, deploy akan mengunci semua orang sekaligus di layar ganti
kata sandi. Itu jenis kesalahan yang tidak bisa dibatalkan dari dalam aplikasi.

### P8 · Riwayat & pemulihan pengaturan akses

**Masalah.** *"Kemarin akses Sari diubah, sekarang dia tidak bisa kerja."* Hari ini
menjawabnya berarti membaca `audit_log` satu per satu dan menerka bentuk sebelumnya dari
kalimat bebas — dan T-15 membuat pencariannya sendiri tidak bisa diandalkan.

**Bentuk, dua lapis.** Lapis pertama, murah dan wajib: **kolom `target_user_id` di
`audit_log`** + indeks. Sesudah itu Pusat Akses bisa menampilkan **garis waktu satu orang**
("22 Ags — diberi akses BLUD oleh admin.it; 3 Sep — peran diubah PROGRAM→UMUM"). Lapis
kedua, opsional: foto sebelum-sesudah yang bisa **dipulihkan ke form** — pola
`blud_riwayat_simpan`/`kinerja_riwayat_simpan` yang sudah dua kali terbukti.

**Kenapa lapis pertama dulu.** Ia menutup T-15, memberi 80% manfaatnya, dan biayanya satu
kolom. Pemulihan menuntut penyimpanan foto + retensi + layar sendiri; kerjakan kalau
ternyata memang sering dibutuhkan, bukan karena polanya menarik.

**Batas & biaya.** Satu migration satu kolom (+indeks). `audit_log` dipangkas 12 bulan
oleh cron retensi — jadi garis waktunya berumur 12 bulan, dan itu **harus ditulis di
layar**, bukan dibiarkan orang mengira riwayatnya lengkap.

### P9 · Alasan singkat pada perubahan wewenang

**Masalah.** Audit hari ini menjawab *apa* dan *siapa*, tidak pernah *kenapa*. Enam bulan
kemudian tidak ada yang ingat kenapa seorang staf gudang punya akses BLUD.

**Bentuk.** Satu kotak teks pendek (wajib, maks ±140 karakter) pada: pemberian/pencabutan
akses, ubah peran, hapus permanen. Masuk ke `detail` audit dan ke garis waktu P8.

**Batas.** **Tidak** diminta pada aktifkan/nonaktifkan rutin dan persetujuan permintaan
akses (di sana alasannya sudah ditulis pemohon). Aturan 11.4 — ini justru contoh paling
gampang untuk melanggarnya.

### P10 · Pemeriksaan Mandiri — satu layar yang mencari masalah sebelum ditanyakan

**Masalah.** Semua pertanyaan berikut hari ini butuh SQL manual, jadi tidak pernah
ditanyakan sampai ada yang salah:

| Yang diperiksa | Kenapa penting |
|---|---|
| Kuota hampir penuh (≥80%) | Supaya "kuota penuh" tidak ditemukan saat sedang buru-buru membuat akun |
| Akun AKTIF yang belum pernah login, atau >90 hari tidak login | Akun hidup tanpa pemakai adalah pintu yang tidak dijaga siapa pun |
| Grant mubazir — modul yang sudah terbuka oleh perannya | Sumber kebingungan T-6; mencabutnya nol risiko |
| Baris izin menu yatim (menu berganti nama/dihapus) | Sudah diakui §5 konsep lama, belum pernah punya layar |
| Sakelar `maintenance` > 7 hari | Sakelar yang lupa dinyalakan balik — kejadian yang sangat mungkin |
| **Modul ber-sakelar yang route-nya tidak menjaganya** | **Gate G dibawa ke layar**: kalau ada yang lolos CI, tetap kelihatan orang |
| SUPER_ADMIN aktif > 2 | Kunci induk sebaiknya sedikit; angkanya harus terlihat |

**Bentuk.** Satu tab, daftar temuan + jumlah + tombol menuju tempat memperbaikinya. Tidak
ada yang otomatis diperbaiki — **melaporkan, bukan membereskan**. Perbaikan otomatis atas
wewenang adalah cara tercepat untuk membuat orang kehilangan akses tanpa ada yang tahu
kenapa.

**Batas & biaya.** Nol tabel, nol kolom — semuanya query yang sudah mungkin hari ini.
Ini kemampuan dengan rasio manfaat-per-risiko tertinggi di seluruh dokumen.

### P11 · Ekspor akses untuk lampiran audit

Satu berkas Excel: akun · peran · status · akses efektif per modul · sumbernya (peran /
grant / berjangka) · tanggal tinjauan terakhir. Reuse pembangkit yang sudah ada, menerima
baris yang sudah dihitung layar. Nol tabel. Kecil, tapi ia yang mengubah P3 dari layar
jadi bukti.

### P12 · Sakelar seluruh aplikasi

**Masalah.** Mematikan semuanya untuk pemeliharaan = 11 klik, dan menyalakannya kembali =
11 klik lagi dengan risiko satu terlewat (T-5 & P10 baris 5 menunjukkan itu bukan
kekhawatiran teoretis).

**Bentuk.** Satu sakelar `app_status_global` + pesan. Dihormati semua guard lewat satu
tempat (`modulMati`/`modulSedangMati` memeriksa kunci global lebih dulu), dan
`PERAN_TEMBUS_SAKELAR` tetap berlaku supaya yang mematikan bisa masuk memeriksa.

**Batas.** Admin Panel **tidak boleh** ikut mati — `menu-client.tsx` sudah mengecualikan
kartu `admin`, dan pengecualian yang sama wajib berlaku di sisi guard. Sakelar global yang
ikut mengunci pintu untuk menyalakannya kembali adalah kesalahan yang hanya bisa
dibetulkan lewat MySQL.

---

## 13. Penataan ulang Admin Panel — 11 tab datar jadi 4 kelompok

Menambah tab ke barisan yang sudah 11 buah akan membuatnya lebih buruk, bukan lebih
lengkap. Dan "satu pintu" tidak berarti "satu halaman raksasa" — ia berarti **satu tempat
masuk dengan urutan yang bisa ditebak**.

| Kelompok | Isi | Catatan |
|---|---|---|
| **AKUN & AKSES** | **Pusat Akses** (baru) · Peran & Matriks · Permintaan (promosi + akses) · Tinjauan | Pusat Akses **menggantikan** tab USER MANAGEMENT dan AKSES MENU — dua tab yang hari ini menjawab pertanyaan yang sama dari dua arah |
| **APLIKASI** | Sakelar & Pemeliharaan · Konfigurasi (baca-saja + tautan, §14) | Sakelar diturunkan registry, lengkap dengan sub-sakelar (T-5) |
| **KEAMANAN** | Sesi Aktif · Monitor Serangan · Status Keamanan · Jejak Audit | Tidak berubah isinya; Jejak Audit dapat penyaring **sasaran** (T-15/P8) |
| **SISTEM** | Broadcast · Email Notif · RIMA Feedback · **Pemeriksaan Mandiri** (baru) | |

Empat kelompok, dan tiga dari empat kelompok itu isinya persis tab yang sudah ada —
yang benar-benar baru cuma dua layar.

> **Diperbarui 2026-09-08.** Paragraf ini semula berbunyi *"`admin.css` dan seluruh token
> warnanya tetap"*, karena mengganti tampilan sekaligus mengganti perilaku membuat masalah
> tidak bisa ditelusuri ke salah satunya. Pemilik aplikasi kemudian mengizinkan
> tampilannya ikut dirombak, jadi **§16 mengambil alih bagian itu** — dan kerangka empat
> kelompok di atas adalah langkah R2 di sana. **Alasan kehati-hatiannya tetap berlaku**:
> revamp dikerjakan setelah perilakunya benar, tidak pernah dalam commit yang sama.

---

## 14. Batas "satu pintu" — apa yang TETAP tinggal di modulnya, dan kenapa

Permintaannya "pengaturan akun & app dari satu pintu". Ada godaan menariknya untuk
menyeret **semua** pengaturan ke Admin Panel. Itu keliru, dan bedanya tajam:

> **Yang pindah: tata kelola akun & akses** (siapa boleh masuk ke mana, sampai kapan,
> modul mana hidup). **Yang tinggal: keputusan domain** (angka, tanggal, kebijakan
> anggaran) — karena yang paham isinya bukan orang IT.

| Pengaturan | Tempatnya hari ini | Keputusan |
|---|---|---|
| Batas waktu pengajuan usulan | Usulan → BATAS WAKTU | **Tetap.** Yang tahu kapan usulan ditutup adalah admin usulan, bukan IT |
| Pagu BLUD | Usulan → SET PAGU | **Tetap.** Angka anggaran |
| Pejabat SPJ, hapus versi | BLUD → Pengaturan | **Tetap.** Sudah berpagar peran sendiri (`canHapusVersi`, di luar jangkauan Admin Panel — §4.5.4, disengaja) |
| Reset data setahun | E-Anggaran → Pengaturan | **Tetap.** SUPER_ADMIN, dan tempatnya di modul yang datanya |
| Notifikasi email | Admin → EMAIL NOTIF | Sudah di sini |
| Kelola User (ubah peran) | Usulan → KELOLA USER | **Tetap** (CLAUDE.md melarang menggabungkan; pemilik aplikasi menegaskan panel ini dibutuhkan). Yang disatukan **aturannya**, bukan panelnya — §5.4 |

Yang menjembatani keduanya: tab **Konfigurasi** di kelompok APLIKASI menampilkan seluruh
`app_config` yang relevan **baca-saja**, dengan nilai terkini, kapan terakhir diubah, dan
**tautan ke tempat mengubahnya**. Jadi "satu pintu" berlaku penuh untuk **menemukan** dan
**memeriksa**, dan sengaja tidak berlaku untuk **mengubah** hal-hal yang bukan urusan
Admin Panel.

Sekalian di situ: T-14 ditutup — `ConfigKeyEnum` mati dihapus atau dijadikan satu-satunya
daftar yang dipakai `POST /api/config`. Satu dari dua, bukan dibiarkan dua-duanya hidup.

---

## 15. Biaya, urutan, dan apa yang dipotong lebih dulu

> **Pertimbangan biaya, bukan urutan final.** Tabel biaya di bawah tetap berlaku dan
> dipakai §17 sebagai bahan; "tiga putaran" di sini adalah draf yang **digantikan
> 14 tahap di §17**. Kalau keduanya berbeda, §17 yang menang.

### Ringkasan biaya

| Butir | Migration | Tabel/kolom baru | Route tulis baru | Risiko |
|---|---|---|---|---|
| Bagian I (§1–§10) | **0** | 0 | 0 | Sedang (menyentuh `getSession`, `is*Role`) |
| P1 Paket Akses | 0 | 0 (`app_config` JSON) | 0 (berhenti di form) | Rendah |
| P5 Baca-saja | 0 | 0 | 0 | Sedang (menyentuh pabrik guard) |
| P6 Pesan pemeliharaan | 0 | 0 | 0 | Rendah |
| P10 Pemeriksaan Mandiri | 0 | 0 | 0 | **Sangat rendah** |
| P11 Ekspor | 0 | 0 | 0 | Sangat rendah |
| P12 Sakelar global | 0 | 0 | 0 | Sedang (bisa mengunci semua orang) |
| P9 Alasan wajib | 0 | 0 | 0 | Rendah |
| P8 lapis 1 (garis waktu) | 1 | `audit_log.target_user_id` | 0 | Rendah |
| P3 Tinjauan | 1 | 2 kolom `users` | 0 | Rendah |
| P7 Wajib ganti sandi | 1 | 2 kolom `users` | 0 | **Tinggi** (menyentuh alur login) |
| P2 Akses berjangka | 1 | 1 tabel + 1 cron | 1 (cron) | Sedang |
| P4 Permintaan mandiri | 1 | 1 tabel | 1 (ajukan) | Sedang |

### Urutan yang saya sarankan

**Putaran 1 — nol migration, manfaat langsung.**
**R0 (maket)** ∥ Fase A (perbaikan keamanan) → Fase B (registry + gate G dari registry) →
**R1–R2** (token/tema + kerangka) → **P10** → **P6** → **R3** (komponen per tab) →
Fase C + **R4** (layar Pusat Akses, langsung dengan bahasa visual baru) → **P1** →
**R5** (ratchet gate E).

Alasan urutan ini: Fase A menutup tiga lubang yang sedang terbuka; Fase B mencegahnya
lahir lagi; R1–R2 membereskan fondasi tampilan **sebelum** ada layar baru digambar di
atasnya (menggambar layar baru di atas 61 `!important` berarti mengerjakannya dua kali);
P10 memberi tahu apa lagi yang salah sebelum layar barunya dirancang, jadi ia dirancang
untuk masalah yang nyata; P6 murah dan menghentikan telepon masuk; lalu layar; lalu paket
yang membuat layarnya cepat dipakai.

**R0 ditandai ∥ (paralel)** karena ia berkas HTML statis di `docs/design/` — tidak
menyentuh aplikasi sama sekali, jadi ia bisa dikerjakan dan disetujui sementara Fase A
berjalan. Ia justru **harus** selesai lebih dulu dari R1: token dan ukuran huruf yang
dipakai R1 diputuskan di maket, bukan di tengah refactor.

**Putaran 2 — satu migration masing-masing, dipilih sesuai kebutuhan.**
**P8 lapis 1** (paling murah, menutup T-15) → **P9** → **P3 + P11** (pasangan; tinjauan
tanpa ekspor cuma setengah) → **P5** (BLUD/PK + empat modul pabrik).

**Putaran 3 — kalau memang terasa kurang.**
**P2** → **P4** → **P12** → **P7**.

**P7 sengaja terakhir** meski nilainya tinggi: ia satu-satunya yang mengubah alur login,
dan kalau salah, kesalahannya tidak bisa dibetulkan dari dalam aplikasi. Ia layak
dikerjakan sendirian, dengan perhatian penuh, bukan menempel di ekor pekerjaan lain.

### Kalau waktunya harus dipotong

Potong dari bawah: **P7, P12, P4, P2** boleh tidak pernah dikerjakan tanpa merusak apa
pun. **P5** boleh berhenti di BLUD+PK saja. **P8** boleh berhenti di lapis pertama.
Dari sisi revamp: **R3 boleh berhenti separuh** (tab yang belum tersentuh tetap jalan
dengan tampilan lama — R1 sudah membuat warnanya nyambung), dan **R5 tinggal satu
perintah**. Yang **tidak boleh** berhenti di tengah cuma **R1**: mencampur berkas
ber-`!important` dengan berkas ber-variabel adalah keadaan yang lebih buruk daripada
kedua-duanya.

Yang **tidak boleh** dipotong: **Fase A** (tiga sakelar yang tidak menjaga + peran yang
tidak berlaku sampai logout — dua-duanya sedang terbuka sekarang) dan **B5** (gate G
diturunkan dari registry). Tanpa B5, semua yang lain cuma menambal apa yang kebetulan
ketahuan hari ini.

---

## 16. Revamp tampilan Admin Panel

> Ditambahkan 2026-09-08 atas persetujuan pemilik aplikasi. §13 sebelumnya sengaja
> menahan diri ("`admin.css` tetap") karena mengganti tampilan sekaligus perilaku
> membuat masalah tidak bisa ditelusuri ke salah satunya. Dengan izin ini, batasannya
> berubah — tapi **alasan di balik kehati-hatiannya tidak**: revampnya tetap dikerjakan
> **setelah** perilakunya benar, bukan bersamaan (§16.8).
>
> **Diperbarui 2026-09-09.** Pemilik aplikasi memutuskan revampnya dikerjakan **persis
> seperti maket** `docs/design/revamp-admin-pusat-akses.html`, **kedua tema**. Maket itu
> karena itu jadi acuan yang mengikat: kalau §16.2–§16.7 di bawah terbaca berbeda dari
> maketnya, **yang berlaku maketnya**. Sian `#00D4FF` dengan sendirinya lepas (§9-5).

### 16.1 Diagnosis — kenapa Admin Panel layak dirombak, dengan angka

Admin Panel adalah **satu-satunya modul yang berdiri di luar sistem desainnya sendiri**.
Bukan penilaian selera; ini yang terukur:

| Yang diukur | Angka | Artinya |
|---|---|---|
| Hex unik di berkas ber-path `/admin/` | **44** | Sementara `DESIGN-SYSTEM.md` menyediakan palet lengkap |
| Hex baseline gate E yang **hanya** hidup di Admin Panel | **13** | Merombaknya menurunkan baseline gate E **238 → 225** — utang yang bisa dilunasi, bukan cuma ditahan |
| Baris `[data-theme="light"] … !important` di `admin.css` | **61** | Tema terang dikerjakan dengan menimpa, bukan dengan variabel |
| Kemunculan `.ap-btn` | **82** | Tombol buatan sendiri, sementara `PrimaButton` wajib untuk CTA utama |
| Berkas panel yang **sudah** memakai komponen sistem | **4 dari 13** | Migrasinya sudah jalan sendiri — tinggal diselesaikan |
| Native `title=""` | **0** | Ini sudah benar; tooltip tidak perlu disentuh |

**Yang menyimpang mode GELAP, bukan mode terang.** Draf pertama catatan ini menuduh
keduanya; setelah `DESIGN-SYSTEM.md` §Theme Toggle Behavior dibaca sampai habis,
tuduhannya salah separuh dan perlu diluruskan karena ia mengubah rekomendasinya:

- **Mode terang hampir benar.** Sistem ini memang **berganti merek di mode terang** —
  emas `#EF9F27` (gelap) → gradien ungu-merah muda `linear-gradient(135deg,#8B5CF6,#EC4899)`
  (terang), berlaku **untuk seluruh aplikasi**, bukan kekhasan Admin Panel. Yang dipakai
  `admin.css` adalah `#7C3AED` + `#EC4899` — meleset **satu hex** dari yang resmi
  (`#8B5CF6`). Jadi ini pembetulan kecil, bukan perombakan.
- **Mode gelap yang menyimpang penuh.** Sian `#00D4FF` + `#00FFC8` di atas `#020B14`,
  sementara seluruh modul lain memakai emas di atas `#020F1C`. Tidak satu pun dari
  ketiganya ada di `DESIGN-SYSTEM.md`.

Untuk maksud yang sama persis juga ada **tiga merah** hidup berdampingan (`#FF4466`,
`#FF4444`, `#FF6B6B`). Itu bukan pilihan, itu kelalaian yang menumpuk — dan tepat inilah
yang gate E dipasang untuk hentikan.

**Cara memperbaikinya sudah ditemukan di berkas itu sendiri.** `admin.css` sudah menulis
alasannya untuk panel Akses Menu: *"Warna panel Akses Menu lewat variabel, bukan hex
langsung … Variabel memutus simpul itu: satu nilai dibaca style inline, satu lagi ditimpa
per tema."* Itu betul, dan sudah dipakai untuk `--ma-*`. Revamp ini **menyelesaikan** apa
yang sudah dimulai di sana — bukan memperkenalkan pendekatan baru.

**Preseden bentuk kerjanya juga sudah ada**: `docs/design/revamp-renaksi-gabungan.html`
(764 baris) dan `revamp-renaksi-kinerja.html` (1.499 baris) — maket HTML statis, seluruh
warnanya dari `DESIGN-SYSTEM.md`, nol hex baru. Revamp ini mengikuti jalur yang sama:
**maket dulu, disetujui, baru kode.**

### 16.2 Arah rasa — identitas dari kepadatan, bukan dari palet asing

Admin Panel **memang boleh terasa berbeda**. Ia ruang kendali: dipakai sebentar,
untuk memutuskan, oleh satu-dua orang. Yang keliru bukan keinginan itu — keliru adalah
mencapainya dengan mencomot warna dari luar sistem.

Identitasnya dipindahkan ke tiga hal yang tidak menuntut warna baru:

1. **Kepadatan.** Baris lebih rapat, tinggi baris 32px (bukan 44px seperti tabel
   anggaran), padding kartu 16px. Ruang kendali menampilkan banyak dalam satu layar;
   itu yang membuatnya terasa "kokpit".
2. **Angka bergaya mono.** `JetBrains Mono` untuk jam, ID sesi, IP, hitungan kuota,
   stempel waktu. Aturan sistemnya sudah mewajibkan mono untuk angka keuangan; di sini
   dasarnya sama — angka yang dibandingkan sejajar harus sejajar sungguhan.
3. **Grid halus di kanvas.** Pola kisi 40px yang sekarang ada **dipertahankan**, cuma
   warnanya diganti dari `rgba(0,212,255,.025)` ke turunan `{colors.hairline}`. Yang
   memberi kesan HUD adalah kisinya, bukan sian-nya.

Palet resminya, seluruhnya dari `DESIGN-SYSTEM.md`:

| Peran | Token | Hex | Menggantikan |
|---|---|---|---|
| Kanvas | `{colors.canvas-dark}` | `#020F1C` | `#020B14` |
| Kartu | `{colors.surface-card}` | `#042C53` | `rgba(7,21,37,.92)` |
| Terangkat (kepala tabel, tab aktif) | `{colors.surface-elevated}` | `#0C447C` | `rgba(0,212,255,.08)` |
| Garis rambut | `{colors.hairline}` | `#0C447C` | `rgba(0,212,255,.12)` |
| Teks utama | `{colors.text-primary-dark}` | `#E6F1FB` | `#E0F7FF` |
| Teks redup | `{colors.text-muted-dark}` | `#85B7EB` | `#5A8EA8` |
| **Aksen utama** | `{colors.primary}` | `#EF9F27` | `#00D4FF` |
| Aksen sistem/info | `{colors.info}` | `#378ADD` | `#00D4FF` (peran kedua) |
| Aman / online | `{colors.action-success}` | `#1D9E75` | `#00FFC8` |
| Bahaya / offline | `{colors.action-danger}` | `#E24B4A` | `#FF4466`, `#FF4444`, `#FF6B6B` |
| Perhatian / maintenance | `{colors.warning}` | `#BA7517` | `#FFCC00`, `#FF9944` |

Tabel di atas **mode gelap**. Mode terang mengikuti §Theme Toggle Behavior apa adanya —
kanvas `#FAFAFB`, kartu `#FFFFFF`, terangkat `#F4F4F7`, garis `#E5E5EA`, teks `#0F0F12` /
`#3A3A42` / `#8A8A95`, dan **aksennya tetap gradien ungu-merah muda** `#8B5CF6 → #EC4899`
seperti seluruh aplikasi. Yang berubah dari keadaan sekarang cuma `#7C3AED` → `#8B5CF6`
dan hilangnya 61 `!important` (§16.6).

> Catatan untuk yang mengerjakan: `DESIGN-SYSTEM.md` memuat **dua** daftar warna terang —
> §"Surface — Light Mode" (`#F5F5F7`/`#FAFAFA`/`#D3D1C7`) dan §"Theme Toggle Behavior"
> (`#FAFAFB`/`#FFFFFF`/`#F4F4F7`/`#E5E5EA`). Yang dipakai **yang kedua**, karena itu
> bagian yang mengatur perpindahan tema. Keduanya sudah ada di baseline gate E, jadi
> pilihan ini tidak menambah hex — tapi ketidakcocokan itu sendiri layak dirapikan di
> pekerjaan lain.

**Satu hal yang sengaja dibuang: animasi `scan`.** Garis pindai yang bergerak
terus-menerus 12 detik sekali, selamanya, di halaman yang dipakai untuk membaca daftar
akun. Ia menarik saat demo dan melelahkan saat kerja. Kalau tetap diinginkan, ia wajib di
balik `@media (prefers-reduced-motion: reduce)` — tapi rekomendasi saya: dibuang.
Denyut `pls` pada ikon merek juga: satu elemen berdenyut abadi menarik mata ke tempat
yang tidak butuh perhatian.

### 16.3 Kerangka layar

Bilah tab datar berisi 11 item digulir mendatar — itu sudah tidak nyaman sekarang, dan
§13 menambah dua layar lagi. Kerangka barunya:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ◧ PRIMA · PUSAT KENDALI            08:41:07     [tema]  [BS] budi ▾        │  56px
├──────────────┬─────────────────────────────────────────────────────────────┤
│ AKUN & AKSES │                                                             │
│  Pusat Akses │   ← isi tab                                                 │
│  Peran       │                                                             │
│  Permintaan ③│                                                             │
│  Tinjauan    │                                                             │
│              │                                                             │
│ APLIKASI     │                                                             │
│  Sakelar     │                                                             │
│  Konfigurasi │                                                             │
│              │                                                             │
│ KEAMANAN     │                                                             │
│  Sesi Aktif  │                                                             │
│  Monitor     │                                                             │
│  Status      │                                                             │
│  Jejak Audit │                                                             │
│              │                                                             │
│ SISTEM       │                                                             │
│  Pemeriksaan⚠│                                                             │
│  Broadcast   │                                                             │
│  Email       │                                                             │
│  RIMA        │                                                             │
└──────────────┴─────────────────────────────────────────────────────────────┘
   208px
```

Empat perubahan, masing-masing dengan sebabnya:

- **Tab mendatar → rel kiri berkelompok.** 15 tujuan tidak muat mendatar tanpa digulir,
  dan tujuan yang harus digulir untuk ditemukan sama saja dengan tidak ada. Rel kiri juga
  memberi tempat untuk **lencana angka** (3 permintaan menunggu, 2 temuan pemeriksaan) —
  yang hari ini tidak punya tempat sama sekali, jadi tidak ada yang tahu ada yang
  menunggu.
- **Topbar 76px → 56px.** Tinggi 76px dipakai untuk merek berbingkai + subjudul
  9px yang isinya nama panjang instansi. Itu informasi yang dibaca sekali seumur hidup,
  menempati ruang permanen di layar yang isinya tabel.
- **Jam tetap ada**, dipindah ke tengah, mono, `{colors.text-muted-dark}` — bukan
  sian menyala 22px. Ia berguna untuk membaca "idle 12m" di tabel sesi; ia bukan hiasan,
  tapi juga bukan judul.
- **Rel menyusut jadi ikon** di bawah 1100px, dan jadi laci (drawer) di bawah 720px.

### 16.4 Pusat Akses — susunan detail

Dua kolom. Kiri daftar orang (tetap terlihat), kanan berkas orang terpilih.

```
┌ ORANG ───────────────┬ BUDI SANTOSO ─────────────────────────────────────┐
│ [cari…]        [+]   │  budi.s · budi@rsjd.go.id                          │
│ ▸ status: AKTIF ▾    │  ┌───────────┬───────────┬───────────┬──────────┐  │
│                      │  │ PERAN     │ STATUS    │ SESI      │ TINJAUAN │  │
│ ● budi.s     PROGRAM │  │ PROGRAM   │ AKTIF     │ 2 aktif   │ 6 bln lalu│ │
│   sari.w    KEUANGAN │  │ [ubah]    │[nonaktif] │ [putuskan]│ [tinjau] │  │
│   joko.p       UMUM ⏸│  └───────────┴───────────┴───────────┴──────────┘  │
│   …                  │                                                    │
│                      │  PINTU MODUL                    [Terapkan paket ▾] │
│  ▸ 27 orang          │  ┌──────────────────────────────────────────────┐  │
│                      │  │ ✓ BLUD          diberi akses      ☑  ▸ menu  │  │
│                      │  │   └ 12 menu · 2 perkecualian                 │  │
│                      │  │ ✓ Perj. Kinerja karena peran     ☐̸  ▸ menu  │  │
│                      │  │ ⏱ Dashboard     s/d 30 Sep (12h) ☑          │  │
│                      │  │ ✗ E-Anggaran    tertutup          ☐          │  │
│                      │  └──────────────────────────────────────────────┘  │
│                      │                                                    │
│                      │  GARIS WAKTU                          [semua ▸]    │
│                      │   03 Sep · peran UMUM → PROGRAM · admin.it         │
│                      │   22 Ags · diberi akses BLUD · admin.it            │
│                      │                                                    │
│                      │  [ Lihat sebagai orang ini ]        [ Simpan ]     │
└──────────────────────┴────────────────────────────────────────────────────┘
```

Yang bekerja keras di susunan ini:

**Kolom kedua tiap baris modul adalah SEBABNYA**, dan itu bukan hiasan — ia yang membuat
kotak centang jujur. `karena peran` → kotaknya **dimatikan** dengan penjelasan sebaris
("terbuka karena peran PROGRAM; mencabut centang tidak menutupnya"). `s/d 30 Sep` →
akses berjangka (P2), dengan sisa harinya. Tanpa kolom ini, layar barunya akan
mengulangi T-6 dalam bentuk yang lebih rapi.

**Empat kartu ringkas di atas** menggantikan tombol-tombol yang hari ini berdesakan di
kolom AKSI tabel (NONAKTIF · ROLE · PW · UNLOCK · REVOKE · HAPUS — enam tombol dalam satu
sel selebar ±180px). Tiap kartu = satu pertanyaan + satu aksi.

**Satu tombol Simpan untuk seluruh halaman.** Hari ini tiap modal menyimpan sendiri, jadi
mengatur satu orang = 3–4 penyimpanan terpisah yang bisa berhenti di tengah. Satu Simpan
= satu transaksi, dan pengingat "belum tersimpan" memakai `lib/shared/belum-tersimpan.ts`
yang **sudah ada** (dipakai DPA & Pergeseran, lengkap dengan tiga pintu keluarnya).

**Nomor versi/penguncian bentrok tetap dipakai.** `sidikJariIzin` + 409 `BERUBAH` sudah
berjalan di `MenuAccessPanel`; layar baru mewarisinya, tidak menciptakan mekanisme kedua.

### 16.5 Peta komponen — apa yang wajib dipakai ulang

| Sekarang | Menjadi | Alasan |
|---|---|---|
| `.ap-btn.ap-btn-green/red/cyan` (82×) | `<PrimaButton variant="primary\|success\|danger\|purple\|ghost">` | STANDAR WAJIB `DESIGN-SYSTEM.md`; row-action kecil boleh tetap native (aturan skip yang sudah ada) |
| Tombol HAPUS teks | `<DeleteButton>` / `<DeleteIcon>` | Wajib; animasi tutup + hover `#E24B4A` sudah global |
| `.ap-modal-bg` + `.ap-modal-box` (6 modal) | Tetap, tapi radius 14px + token; **konfirmasi destruktif → `confirmDialog()`** | 4 panel sudah memakainya — tinggal sisanya |
| `msg-ok` / `msg-err` | `toast` (sonner) | Dan ini sekalian menutup bentrok nama kelas dengan Usulan & Profil yang sudah dicatat di kepala `admin.css` |
| `.ap-badge badge-green/red/yellow/cyan` | Badge sistem + token status | Empat nama warna → empat token bermakna |
| `.ap-table` | Pola tabel sistem + `overflow-x:auto` wrapper | Tabel sesi/audit lebar; hari ini badan halaman yang menggulir |
| Kotak centang telanjang | `Tip` untuk yang dimatikan | Kotak mati tanpa sebab adalah keluhan UX yang sudah tercatat (L79c) |

### 16.6 Tema terang — 61 `!important` jadi nol

Bentuk sekarang: satu palet ditulis untuk gelap, lalu 61 baris menimpanya untuk terang
dengan `!important`. Konsekuensinya sudah terasa di modul lain — CLAUDE.md mencatat dua
kejadian di mana aturan borongan menelan warna sel dan penulis fiturnya baru tahu setelah
menjalankan aplikasinya (`blud-shell.tsx:628`, `.pg-urai`).

Bentuk barunya sama dengan yang sudah dipakai `--ma-*` di berkas itu:

```css
.ap-body{ --ap-canvas:#020F1C; --ap-card:#042C53; --ap-elev:#0C447C; --ap-line:#0C447C;
          --ap-fg:#E6F1FB; --ap-dim:#85B7EB;
          --ap-aksen:#EF9F27; --ap-aksen-grad:linear-gradient(135deg,#EF9F27,#FAC775); … }
[data-theme="light"] .ap-body{ --ap-canvas:#FAFAFB; --ap-card:#FFFFFF; --ap-elev:#F4F4F7;
          --ap-line:#E5E5EA; --ap-fg:#0F0F12; --ap-dim:#8A8A95;
          --ap-aksen:#8B5CF6; --ap-aksen-grad:linear-gradient(135deg,#8B5CF6,#EC4899); … }
```

Satu tempat mendefinisikan, satu tempat menimpa, **nol `!important`**. Pergantian merek
emas→ungu di mode terang **dipertahankan** karena itu memang aturan sistemnya (§16.1);
yang diperbaiki cuma nilainya (`#7C3AED` → `#8B5CF6`) dan caranya. Aturan untuk
seterusnya: di dalam `.ap-body` tidak boleh ada hex langsung; yang boleh cuma
`var(--ap-*)`. Itu bisa diuji, dan uji itu yang membuat aturannya bertahan.

### 16.7 Responsif, sentuh, gerak, keterbacaan

- **Titik henti** mengikuti sistem: rel jadi ikon <1100px, jadi laci <720px, dua kolom
  Pusat Akses jadi satu kolom bertumpuk <900px.
- **Sasaran sentuh** min 32×32px untuk aksi baris, 40px untuk tombol utama. Hari ini ada
  tombol `padding:'2px 8px', fontSize:9` — itu 9px, dan yang memakainya sering orang yang
  sudah cukup umur.
- **Ukuran huruf minimum 11px**, dan **12px** untuk apa pun yang dibaca berbaris-baris.
  Hari ini label 9px dipakai untuk teks yang membawa arti (`accessSummary`, subjudul
  merek, label KPI).
- **`prefers-reduced-motion`** dihormati untuk semua animasi yang tersisa.
- **Kontras** wajib lolos WCAG AA (4.5:1 untuk teks biasa). `#5A8EA8` di atas `#020B14`
  hari ini ≈ 5.3:1 — lolos; tapi `#5A8EA8` di atas kartu `rgba(7,21,37,.92)` untuk teks
  9px tidak lagi memadai secara praktis. Diperiksa saat maket, bukan setelah rilis.
- **Fokus papan tik terlihat** — outline 2px `{colors.info}`. Hari ini banyak elemen
  interaktif berupa `<div onClick>` (mis. `.ap-user`) yang tidak bisa di-Tab sama sekali;
  di revamp semuanya jadi `<button>`.

### 16.8 Cara memindahkannya tanpa merusak

Aturan pokok: **perilaku dulu, tampilan kemudian, dan tidak pernah dalam satu commit.**
Kalau keduanya bercampur lalu ada yang salah, tidak ada cara memisahkan "salah logika"
dari "salah CSS" selain membatalkan dua-duanya.

- **R0 — maket dulu. ✅ SELESAI 2026-09-08** → `docs/design/revamp-admin-pusat-akses.html`
  (42 KB, mandiri, bisa dibuka langsung di peramban tanpa server).
  Isinya kerangka + tiga layar yang bentuknya benar-benar baru — Pusat Akses, Sakelar &
  Pemeliharaan, Pemeriksaan Mandiri — dua tema dengan tombol pengganti, data contoh yang
  ditandai sebagai contoh di pita atas.
  **Nol hex baru: 36 warna dipakai, ketiga puluh enamnya ada di `DESIGN-SYSTEM.md`**
  (diperiksa dengan aturan yang sama dengan gate E). Nol `title=` bawaan peramban.
  Yang sengaja **tidak** digambar: Peran, Permintaan, Tinjauan, Konfigurasi, dan empat
  layar Keamanan — semuanya sudah ada di aplikasi atau sudah dirancang di dokumen ini,
  jadi menggambarnya cuma menambah halaman tanpa menambah keputusan.
  Disetujui dulu, baru R1. Ini juga yang membuat §16.7 bisa diukur sebelum ada satu
  komponen pun ditulis.
- **R1 — token & tema** (`admin.css`): variabel, buang `!important`, buang animasi abadi.
  Layar boleh terlihat "kurang menyala" pada langkah ini — itu memang tujuannya.
- **R2 — kerangka**: topbar + rel berkelompok. Isi tab **tidak disentuh**; ia cuma pindah
  wadah, jadi kalau ada yang rusak, penyebabnya cuma satu.
- **R3 — komponen** per tab, satu tab satu commit, mulai dari yang paling jarang dipakai
  (RIMA Feedback, Broadcast) supaya kesalahan pertama terjadi di tempat yang paling
  murah.
- **R4 — Pusat Akses & Pemeriksaan Mandiri** digambar langsung dengan bahasa visual baru.
  Keduanya layar baru, jadi tidak ada yang bisa "mundur".
- **R5 — ratchet gate E**: `node scripts/check-design-tokens.mjs --update`, baseline
  **turun**. Diperiksa: `_jumlah` harus ≤225, dan **tidak boleh naik**.

Tab lama tetap hidup berdampingan sampai penggantinya terbukti — kecuali USER MANAGEMENT
dan AKSES MENU, yang memang digantikan Pusat Akses dan **harus** dimatikan bersamaan
(dua pintu ke pengaturan yang sama adalah cara paling cepat membuat dua orang saling
menimpa).

### 16.9 DoD yang bisa diukur

- [ ] `node scripts/check-design-tokens.mjs` hijau, dan `_jumlah` baseline **≤ 225**
      (turun dari 238) — dibuktikan dengan diff berkas baseline.
- [ ] `grep -c "!important" app/(dashboard)/admin/admin.css` → **0**.
- [ ] Nol hex langsung di dalam berkas `_panels/*.tsx`; semuanya `var(--ap-*)`.
- [ ] Semua CTA utama `<PrimaButton>`; semua hapus `<DeleteButton>`/`<DeleteIcon>`;
      semua konfirmasi destruktif `confirmDialog()`; nol `window.confirm`/`alert`.
- [ ] Kedua tema diperiksa **di peramban**, bukan dari kode — termasuk mode terang, yang
      selama ini paling sering ketahuan rusak hanya saat dijalankan.
- [ ] Lebar 375px: tidak ada yang keluar layar (pelajaran lencana "BELUM TERSIMPAN" yang
      mendorong pil versi keluar layar +96px).
- [ ] `npx tsc --noEmit` + ESLint bersih; 7 gate CI hijau.

---
---

# BAGIAN III — RENCANA KERJA FINAL

## 17. Pentahapan — satu urutan yang berlaku

> **Ini satu-satunya jawaban untuk "kerjakan apa dulu".** §6 (fase per-bagian), §12
> (kemampuan), §15 (biaya & putaran), dan §16.8 (langkah revamp) **tetap ada sebagai
> rincian** — kalau salah satunya kelihatan berbeda dari §17, yang berlaku §17. Tiga
> daftar urutan untuk satu pekerjaan adalah bentuk yang sudah dihukum sendiri di
> modul E-Anggaran (L88); dokumen ini tidak boleh mengulanginya.

### 17.1 Peta satu halaman

| # | Tahap | Isi (kode lama) | Migrasi | Yang terlihat sesudahnya | Boleh dilewati? |
|---|---|---|---|---|---|
| **0** | Keputusan & pemeriksaan server | §9 nomor 1–6 · baca `app_config` & daftar grant | — | Belum ada; ini yang mencegah tahap 1 merusak | **Tidak** |
| **1** | Menutup yang sedang terbuka | Fase A (A1–A6) | 0 | Sakelar Usulan/PK/Dashboard benar-benar menutup; peran & nonaktif berlaku saat itu juga | **Tidak** |
| **2** | Satu daftar | Fase B (B1–B6) | 0 | Tak ada perubahan yang terlihat — tapi modul ke-11 tidak bisa lagi lahir cacat | **Tidak** |
| **3** | Fondasi tampilan | R1 + R2 | 0 | Admin Panel memakai warna sistem; rel kiri berkelompok | Ya (menunda revamp) |
| **4** | Sakelar & Pemeriksaan | T-5 · P6 · P10 | 0 | Sub-sakelar Realisasi punya tombol; pesan pemeliharaan; layar temuan | Ya |
| **5** | Pusat Akses | Fase C + R4 + P1 | 0 | **Satu pintu berdiri** | Ya, tapi ini intinya |
| **6** | Usulan & penutup revamp | Fase D + R3 sisa + R5 | 0 | Ubah peran di Usulan sepagar Admin Panel; baseline gate E turun | Ya |
| **7** | Jejak & alasan | P8 lapis 1 + P9 | 1 | Garis waktu per orang; tiap perubahan wewenang punya alasan | Ya |
| **8** | Tinjauan berkala | P3 + P11 | 1 | Kewajiban AUTHZ-02 punya alat & bukti | Ya |
| **9** | Mode baca-saja | P5 | 0 | Modul bisa dibekukan saat tutup buku | Ya |
| **10** | Akses berjangka | P2 | 1 | Akses pinjaman kembali sendiri | Ya |
| **11** | Permintaan mandiri | P4 | 1 | Antrean WhatsApp pindah ke aplikasi | Ya |
| **12** | Sakelar global | P12 | 0 | Satu tombol untuk pemeliharaan menyeluruh | Ya |
| **13** | Wajib ganti kata sandi | P7 | 1 | Kata sandi berhenti diketahui dua orang | Ya |

**Tahap 0–2 wajib**, dan itu satu-satunya bagian yang saya sebut wajib. Sisanya boleh
berhenti di mana saja — tiap tahap meninggalkan aplikasi dalam keadaan utuh, bukan
setengah jadi. Kecuali dua titik yang disebut di §17.4.

### 17.2 Rincian tiap tahap

Format: **prasyarat → isi → selesai kalau → risiko utamanya**.

---

#### Tahap 0 · Keputusan & pemeriksaan server — *tanpa kode*

**Isi.** ~~Enam keputusan §9~~ — **selesai 2026-09-09**, jawabannya tertulis di §9.
Yang paling menentukan lingkup (nomor 1) dijawab **SUPER_ADMIN saja**, dan itu
menambahkan **A7/T-16** ke Tahap 1. Sisa Tahap 0 tinggal **dua kueri di server kantor**,
dan keduanya harus dijalankan sebelum baris kode pertama:

```sql
SELECT `key`, value, updated_at FROM app_config WHERE `key` LIKE 'app_status_%';
SELECT username, role, status, app_access FROM users WHERE app_access IS NOT NULL;
```

**Selesai kalau.** ~~Jawaban keenam keputusan tertulis di dokumen ini~~ (sudah), dan
hasil dua kueri itu diketahui. **Kueri itu satu-satunya yang menahan Tahap 1 dimulai.**

**HASIL — dijalankan 2026-09-09 di laptop kantor** (`D:\APLIKASI\prima-web-3`, basis
data `prima_db_3`, lewat `scripts/cek-tahap-0.mjs`). **Tahap 0 SELESAI, putusannya
AMAN.**

1. **Sakelar: semuanya `online`.** Ketiga yang akan dipasangi pagar Tahap 1 bersih —
   `app_status_usulan_aset` dan `app_status_perjanjian_kinerja` bernilai `online`, dan
   `app_status_dashboard` **belum punya baris sama sekali**, yang juga aman: baris yang
   tidak ada tidak pernah masuk himpunan "mati" di `modulMati()`
   (`lib/security/guard.ts`), jadi terbaca online. Fail-closed di sana berlaku untuk
   **gagal membaca**, bukan untuk baris yang belum pernah dibuat.

   Jebakan yang ditakutkan memang nyata, tapi bukan di sana: di basis data **dev**,
   `app_status_dashboard` bernilai `maintenance` sejak 2026-08-03 dan tidak ada yang
   menyadarinya — persis karena hari ini sakelar itu tidak berefek. Kalau Tahap 1 naik
   di mesin itu tanpa dibaca dulu, Dashboard mati di detik pertama deploy dan tuduhannya
   akan jatuh ke kode baru. Ini yang membuat Tahap 0 bukan formalitas.

   Seluruh stempel waktunya berkerumun di `2026-08-24 02:59:07` = saat basis datanya
   dibuat. Artinya **belum pernah ada yang menyentuh satu sakelar pun** di kantor.

2. **Akun dengan `app_access`: NOL.** Semua akses hari ini lahir dari peran saja.

   Dua akibatnya, dan yang kedua menggeser cara memandang Tahap 5:

   - **A7 jadi tanpa risiko.** Mempersempit `set-app-access` ke SUPER_ADMIN tidak bisa
     mengganggu siapa pun — fiturnya memang belum pernah dipakai di sana.
   - **Pusat Akses bukan alat pembersih, melainkan alat pembuka.** Rancangan ini
     ditulis dengan bayangan "banyak pemberian akses yang telanjur berantakan dan perlu
     dirapikan". Datanya bilang sebaliknya: tidak ada satu pun. Jadi nilainya bukan
     merapikan yang lampau, melainkan membuat pemberian akses per-orang **jadi mungkin
     dilakukan tanpa takut**. Hari ini satu-satunya cara memberi seseorang akses ke satu
     modul adalah **mengganti perannya** — yang selalu memberi lebih banyak daripada
     yang dimaksud. §12 P1 (Paket Akses) dan §4.5 harus dibaca ulang dengan kacamata
     itu saat Tahap 5 dikerjakan.

   Yang **belum** ditanyakan dan sengaja tidak menahan apa pun: berapa perkecualian di
   `menu_role_access`/`menu_user_access`. Itu baru berarti di Tahap 5.

**Risiko kalau dilewati.** Kueri pertama bukan formalitas: Tahap 1 membuat tiga sakelar
yang selama ini tidak berpengaruh jadi berpengaruh. Kalau salah satunya kebetulan
bernilai `maintenance` — pernah dicoba lalu dilupakan, dan tidak ada yang akan
menyadarinya karena memang tidak berefek — modulnya **mati begitu deploy**.

---

#### Tahap 1 · Menutup yang sedang terbuka — *Fase A*

**Prasyarat.** Tahap 0.

**Isi.** A1 pagar sakelar untuk Usulan, PK, Dashboard (halaman **dan** tiap route,
dengan pengecualian `PERAN_TEMBUS_SAKELAR`) · **A2 (diubah §9-2)** keepalive membaca
peran segar dari DB lewat `JOIN users`, sesi **tidak** dicabut saat ubah peran · A3
nonaktif mencabut sesi + `getSession` menumpang query yang sudah ada · A4 kuota di jalur
`aktifkan` · A5 & A6 dua tambalan satu baris (`app_status_blud_realisasi` masuk daftar
label, `dashboard` masuk `APP_CHECKS`) · **A7 (baru — keputusan §9-1)** `nonaktif`,
`aktifkan`, dan `set-app-access` di `PATCH /api/admin/users` naik lantainya ke
SUPER_ADMIN, begitu pula `GET`/`POST /api/admin/menu-access`; `GET /api/admin/users` dan
`PATCH ubah-role` **tidak disentuh** (T-16).

**Selesai kalau.** Diverifikasi **di peramban**, bukan dari kode: mematikan sakelar
Usulan lalu **mengetik `/usulan-kebutuhan` langsung** mendarat di `/maintenance`;
menurunkan peran akun uji yang sedang login membuatnya **tetap masuk**, lalu peran
barunya berlaku setelah keepalive berikutnya (mendarat di `/login` = A2 salah pasang);
menonaktifkan akun uji yang sedang login menghentikannya saat itu juga;
mengaktifkan akun ke peran yang kuotanya penuh dijawab 409. Untuk A7 **dua-duanya
diperiksa, bukan salah satu**: akun uji ber-peran ADMIN dijawab 403 saat memanggil
`set-app-access` langsung, **dan** panel Kelola User di Usulan tetap bisa mengubah peran
seperti biasa — yang satu tanpa yang lain berarti pagarnya salah pasang. Plus
`npx tsc --noEmit`, ESLint, 7 gate CI.

**Uji regresi baru.** `scripts/test-sesi-dicabut.mts`.

**HASIL — dikerjakan 2026-09-09.** A1–A7 selesai ditulis; 44 berkas (38 diubah, 6 baru),
nol migrasi, nol tabel, nol endpoint baru.

| Yang sudah terbukti | Caranya |
|---|---|
| 35 handler Usulan + PK menanyakan sakelar, **per handler** bukan per berkas | `test-sesi-dicabut.mts` menghitung `usulanMati`/`pkMati` == jumlah `getSession()` |
| Sakelar benar-benar terbaca dari DB, dan SUPER_ADMIN menembusnya | dijalankan sungguhan terhadap dev DB: `app_status_dashboard` = `maintenance` → mati untuk ADMIN, **tidak** untuk SUPER_ADMIN; kunci yang belum punya baris terbaca hidup |
| 44 route tidak ada yang patah | 10 endpoint ditembak tanpa sesi → 401 semua, nol 500, log dev server bersih |
| Gate G naik dari 65 route/6 modul jadi **95 route/9 modul** | `npm run check:killswitch` |
| Asersinya menggigit | **14 uji mutasi, 14 tertangkap** — tiap perbaikan dikembalikan satu per satu ke bentuk cacatnya |
| tsc + ESLint + gate E | bersih (4 warning ESLint semuanya di berkas yang tidak disentuh) |

**Yang BELUM diverifikasi, dan sengaja tidak saya paksakan**: langkah "di peramban"
dengan akun sungguhan. Itu butuh memasukkan kata sandi ke form login, dan saya tidak
melakukannya. Daftar periksanya diserahkan ke pemilik aplikasi — empat hal: mengetik URL
modul yang dimatikan harus mendarat di `/maintenance`; menurunkan peran akun uji yang
sedang login harus membuatnya **tetap masuk** dengan peran baru berlaku setelah keepalive
(bukan terlempar ke `/login`); menonaktifkan akun yang sedang login harus
menghentikannya saat itu juga; mengaktifkan akun ke peran berkuota penuh harus dijawab
409.

**Catatan untuk yang menguji di komputer dev**: `app_status_dashboard` di basis data itu
bernilai `maintenance` sejak 2026-08-03. Sebelum Tahap 1 nilai itu tidak berefek; mulai
sekarang berefek. Jadi Dashboard **akan tertutup** di sana — itu pagarnya bekerja, bukan
kerusakan. Server kantor tidak kena (Tahap 0: semua `online`).

---

**Risiko.** A3 bagian kedua menyentuh `getSession()` — God Node. Kalau penggabungan
query-nya tidak keluar bersih, **bagian itu ditunda** dan hanya pencabutan sesi yang
dikerjakan; menambah satu query per request bukan harga yang sepadan untuk jaring
pengaman. Keputusan itu diambil saat mengerjakan, bukan sekarang.

**Kenapa paling depan.** Tiga sakelar yang tidak menjaga dan peran yang tidak berlaku
sampai logout **sedang terbuka hari ini**. Semua yang lain di dokumen ini bisa menunggu;
dua ini tidak.

---

#### Tahap 2 · Satu daftar — *Fase B*

**Prasyarat.** Tahap 1 (supaya pagar barunya ikut terbawa saat daftarnya disatukan).

**Isi.** B1 `lib/registry/apps.ts` · B2 `bolehMasukModul()` + delapan `is*Role` jadi
re-export · B3 delapan daftar §2 diturunkan dari registry, `APP_CHECKS` hilang ·
B4 `admin` keluar dari `AppAccessKeyEnum` · **B5 gate G memindai `dirApi` dari registry**
· B6 `NAV_MODULES` & `module-menus.ts` diturunkan.

**Selesai kalau.** Tabel kebenaran `bolehMasukModul` × 27 peran × 10 modul **identik**
dengan `is*Role` lama. Caranya: snapshot dibekukan lebih dulu — jalankan
`scripts/test-registry-akses.mts` terhadap kode **lama**, simpan hasilnya, baru refactor.
Nol perubahan visual. Grant/revoke & sakelar berperilaku sama persis.

**Risiko.** Satu sel bergeser diam-diam = satu peran kehilangan atau mendapat modul tanpa
gejala. Itu sebabnya snapshot dibekukan sebelum kode lama dihapus — bukan sesudah.

**Kenapa wajib.** B5 adalah keping yang membuat seluruh dokumen ini bukan sekadar
tambalan. Tanpa B5, Tahap 1 cuma menutup tiga lubang yang kebetulan ketahuan
2026-09-08.

**HASIL — dikerjakan 2026-09-09** (commit `361dbcb` bekuan, `720c158` refactor).

Urutannya ditaati: tabel kebenaran dibekukan **lebih dulu, di commit terpisah**,
selagi kedelapan `is*Role` masih asli. Sesudah refactor, **1.080 sel identik** —
8 modul × 27 peran × 5 keadaan `app_access` (null · kosong · grant sendiri · grant
modul lain · grant semua).

Yang berubah bentuknya: `lib/registry/apps.ts` + `apps-data.mjs` (10 modul), delapan
`is*Role` jadi pembungkus tipis `bolehMasukModul()`, dan **enam** daftar tangan
diturunkan — `APP_CHECKS` (hilang sama sekali), `APP_KEYS`, `APP_STATUS_LABELS`,
`APP_ACCESS_LIST`, `NAV_MODULES`, dan daftar modul gate G. `admin` keluar dari
`AppAccessKeyEnum` (B4). Gate G tetap **95 route/9 modul** — sama seperti sesudah
Tahap 1, sekarang daftarnya bukan lagi ketikan tangan.

**Datanya JavaScript polos (`apps-data.mjs`), bukan TypeScript** — keputusan yang
lahir saat mengerjakan. Gate G jalan di CI dengan `node` biasa dan `tsx` **bukan**
devDependency di repo ini; menambahkannya berarti meregenerasi `package-lock.json`
(L57) di berkas yang paling rawan bentrok dengan agen lain. Pilihan lainnya —
membiarkan gate G mengetik ulang daftar modulnya — justru mengembalikan cacat yang
seluruh registry ini ada untuk membuangnya. Jadi yang dikorbankan bentuk berkasnya,
bukan ketunggalan datanya; tipenya tetap ditegakkan `readonly Modul[]` di `apps.ts`.

**Dua lubang di pekerjaan ini sendiri ditemukan uji mutasi**, keduanya sudah ditutup
dan keduanya tidak akan terlihat dari membaca ulang kodenya:

1. **Kunci modul tak dikenal tidak teruji.** Tabel kebenaran hanya menanyakan modul
   yang memang ada, jadi membalik `if (!m) return false` menjadi `return true` lolos
   tanpa satu sel pun bergeser — padahal akibatnya satu salah ketik kunci membuka
   **semua** pintu untuk **semua** peran. Sekarang deny-by-default diuji terpisah.
2. **Gate G bisa dimatikan per modul dengan menghapus satu baris.** Penyaringnya
   melewati modul yang `penjagaApi`-nya kosong, jadi menghapus baris itu membuat
   modulnya lenyap dari pemeriksaan tanpa satu pesan pun — **T-1 lahir kembali, lewat
   pintu yang saya sendiri baru pasang.** Sekarang keadaan itu MENGGAGALKAN gate.

Total 22 uji mutasi (13 Tahap 1 + 9 Tahap 2), 22 tertangkap.

---

#### Tahap 3 · Fondasi tampilan — *R1 + R2*

**Prasyarat.** Tahap 2. Maket R0 **sudah disetujui**.

**Isi.** R1 `admin.css` jadi variabel (`--ap-*`), 61 `!important` jadi nol, animasi abadi
dibuang, mode terang dibetulkan `#7C3AED` → `#8B5CF6`. R2 topbar 56px + rel kiri
berkelompok empat; **isi tab tidak disentuh** — ia cuma pindah wadah.

**Selesai kalau.** `grep -c "!important" app/(dashboard)/admin/admin.css` → 0. Kedua tema
diperiksa di peramban. Lebar 375px tidak ada yang keluar layar.

**Risiko.** R1 **tidak boleh berhenti di tengah** (§17.4). Dan R2 memindahkan wadah 11
tab sekaligus — kalau ada yang rusak, penyebabnya tetap satu hal, itu sebabnya isi tab
tidak boleh ikut disentuh di commit yang sama.

---

#### Tahap 4 · Sakelar & Pemeriksaan — *T-5 + P6 + P10*

**Prasyarat.** Tahap 2 (P10 butuh registry untuk memeriksa "sakelar tanpa pagar"),
Tahap 3 (dua layar ini digambar dengan bahasa visual baru).

**Isi.** Layar Sakelar digambar ulang: daftar dari registry (jadi sub-sakelar Realisasi
BLUD **muncul sendiri** — T-5 tertutup sebagai efek samping, bukan sebagai tambalan),
lencana **Terjaga / Belum terjaga**, pesan & tanggal pemeliharaan (P6, nol migrasi
karena `app_config.value` sudah TEXT), `/maintenance` memvalidasi nama modul terhadap
registry alih-alih menampilkan `?app=` mentah. Lalu layar **Pemeriksaan Mandiri** (P10).

**Selesai kalau.** Tujuh pemeriksaan P10 memulangkan angka yang benar pada data sungguhan;
mematikan satu modul menampilkan pesannya di `/maintenance` dan di kartu `/menu`.

**Kenapa di sini, bukan sesudah Pusat Akses.** P10 memberi tahu **apa lagi yang salah**
sebelum layar besarnya dirancang — jadi Tahap 5 dirancang untuk masalah yang nyata, bukan
yang dibayangkan. Menukar urutan keduanya membuang keuntungan itu.

---

#### Tahap 5 · Pusat Akses — *Fase C + R4 + P1*

**Prasyarat.** Tahap 2, 3, 4.

**Isi, berurutan di dalamnya:**
1. **C1** kerangka layar: daftar orang + berkas orang + empat kartu ringkas.
2. **C2** baris pintu modul dengan **kolom sebab**; menu ber-indent (T-4 tertutup —
   syarat `punyaBlud()` dibuang, tombolnya muncul untuk setiap modul ber-menu).
3. **C6** jenis peristiwa audit sendiri (`ACCESS_GRANT`/`ACCESS_REVOKE`/`ROLE_CHANGE`).
4. **C5** Arsipkan vs Hapus permanen (T-12), lengkap dengan hitungan jejak yang akan
   kehilangan pemiliknya.
5. **P1** Paket Akses — berhenti di form, disimpan sebagai satu baris `app_config`
   ber-Zod.
6. **C3** "Lihat sebagai orang ini" — **paling akhir, dan yang pertama dipotong** kalau
   waktunya habis.
7. **Mematikan tab USER MANAGEMENT & AKSES MENU** — di commit yang sama dengan C1–C2.

**Selesai kalau.** Satu orang bisa diatur sepenuhnya dari satu halaman, satu Simpan, satu
transaksi; pengingat belum-tersimpan memakai `lib/shared/belum-tersimpan.ts` yang sudah
ada; bentrok dua admin dijawab 409 `BERUBAH` lewat `sidikJariIzin` yang sudah ada.
Diverifikasi dengan **tiga akun uji berbeda peran**.

**Risiko.** Dua pintu ke pengaturan yang sama = dua orang saling menimpa. Karena itu
langkah 7 bukan pilihan dan bukan pekerjaan susulan (§17.4).

---

#### Tahap 6 · Usulan & penutup revamp — *Fase D + R3 sisa + R5*

**Prasyarat.** Tahap 5 (komponen dropdown peran bersama lahir di sana).

**Isi.** D1 dropdown peran Usulan memakai komponen yang sama (kuota, konfirmasi,
peringatan perkecualian menu + probation — T-8) · D2 spanduk penjelas dengan tautan ke
Pusat Akses, kalimatnya menyebut tombol yang **memang ada** di layar tujuan · R3 tab
sisanya (mulai dari yang paling jarang dipakai: RIMA Feedback, Broadcast) · R5
`node scripts/check-design-tokens.mjs --update`.

**Selesai kalau.** `_jumlah` baseline gate E **≤ 225** (turun dari 238), dibuktikan lewat
diff berkas baseline. Nol hex langsung di `_panels/*.tsx`. Semua CTA utama `PrimaButton`,
semua hapus `DeleteButton`/`DeleteIcon`, semua konfirmasi destruktif `confirmDialog()`.

**Sesudah tahap ini, "satu pintu" berdiri penuh.** Tahap 7 ke atas adalah penambahan,
bukan penyelesaian.

---

#### Tahap 7–13 · Penambahan

Masing-masing berdiri sendiri, boleh dikerjakan sesuai kebutuhan yang muncul, dan boleh
tidak pernah dikerjakan.

| Tahap | Isi | Migrasi | Catatan yang menentukan |
|---|---|---|---|
| **7** | P8 lapis 1 (`audit_log.target_user_id` + indeks) + P9 (alasan wajib) | 1 kolom | Garis waktu berumur **12 bulan** (cron retensi) — dan itu wajib ditulis di layar, bukan dibiarkan orang mengira riwayatnya lengkap |
| **8** | P3 Tinjauan (2 kolom `users`) + P11 Ekspor | 2 kolom | Pengekspor **menerima baris yang sudah dihitung layar**, tidak menghitung ulang |
| **9** | P5 Mode baca-saja | 0 | Kerjakan **BLUD + PK** (menjepit `izinMenuRegistry` ke `LIHAT` — hampir gratis) **dan** empat modul pabrik `buatGuardModul`. Usulan/E-Anggaran/Dashboard **disebut terus terang belum dapat** |
| **10** | P2 Akses berjangka + cron | 1 tabel | Pencabutan otomatis **wajib memanggil fungsi pencabutan yang sama** dengan manual (L69). Cron memeriksa "yang sudah lewat", bukan "yang jatuh tempo hari ini" — server kantor dimatikan tiap malam |
| **11** | P4 Permintaan mandiri | 1 tabel | Tabel sendiri, **bukan** menumpang tabel promosi. Tanpa cooldown/probation/kata sandi ulang (aturan 11.4) |
| **12** | P12 Sakelar global | 0 | Admin Panel **tidak boleh** ikut mati — pengecualian kartu `admin` wajib berlaku juga di sisi guard |
| **13** | P7 Wajib ganti kata sandi | 2 kolom | **Dikerjakan sendirian.** Bawaan kolom 0; hanya jalur create/reset yang menyalakannya |

**Fase E** (izin per-menu untuk modul lain) **tidak dijadwalkan.** Ia dipicu permintaan
nyata, dan syaratnya tetap: kalau tabel perannya keluar datar, modul itu tidak
membutuhkannya (pelajaran Kinerja).

### 17.3 Aturan kerja yang berlaku di semua tahap

1. **Perilaku dan tampilan tidak pernah dalam satu commit.** Kalau bercampur lalu ada
   yang salah, tidak ada cara memisahkan "salah logika" dari "salah CSS" selain
   membatalkan dua-duanya.
2. **Commit hanya berkas yang tahap itu ubah.** Ada agent lain yang bekerja di workspace
   yang sama — `git add -A` akan menyeret pekerjaan orang lain.
3. **Tiap tahap yang menyentuh wewenang lahir bersama uji regresinya**, dan ujinya
   diuji-mutasi: rusak satu aturan, pastikan ada yang gagal. Tiga jebakan yang sudah
   memakan korban dan wajib dihindari — kutipan sepotong (**L82c**), prosa komentar yang
   menyalakan tesnya sendiri, dan jendela pemeriksaan yang menjulur ke fungsi lain.
4. **Migrasi dijalankan di server kantor sebagai langkah tersendiri**, sebelum kode yang
   memakainya di-deploy — dan berkas migrasinya menuliskan kueri pemeriksaan duplikat di
   kepalanya, seperti `migration-kinerja-uq-versi.sql`.
5. **Verifikasi di peramban, bukan dari kode.** Tiap tahap yang punya layar diperiksa di
   **kedua tema** dan di lebar **375px**. Sudah terlalu sering hal yang benar di kode
   ternyata salah di layar terang.
6. **`prebuild` jangan dihapus** (L91). Tahap 5 menghapus route/tab lama; mesin yang
   pernah `npm run dev` akan gugur `TS2307` kalau `.next/types` tidak dibersihkan.

### 17.4 Dua titik yang tidak boleh berhenti di tengah

Selain kedua ini, pekerjaan boleh ditinggal berminggu-minggu di antara tahap mana pun
tanpa meninggalkan aplikasi setengah jadi.

- **R1 (Tahap 3).** Campuran berkas ber-`!important` dan berkas ber-variabel lebih buruk
  daripada kedua-duanya utuh — yang menang jadi bergantung urutan muat, dan itu tidak
  bisa dibaca dari kode mana pun.
- **Tahap 5 langkah 1–2 + 7.** Pusat Akses hidup sementara USER MANAGEMENT & AKSES MENU
  masih terbuka = dua pintu ke pengaturan yang sama, dan dua orang bisa saling menimpa
  tanpa 409 karena keduanya memakai jalur penyimpanan berbeda.

### 17.5 Kalau waktunya cuma cukup untuk satu hal

**Tahap 1.** Tiga sakelar yang tidak menutup apa pun dan peran yang tidak berlaku sampai
logout adalah dua hal yang sedang terbuka sekarang. Nol migrasi, nol layar baru, dan
seluruhnya bisa selesai jauh lebih cepat daripada sisa dokumen ini.

Kalau cukup untuk dua: **Tahap 1 + 2** — karena tanpa Tahap 2, Tahap 1 akan diulang lagi
pada modul berikutnya.
