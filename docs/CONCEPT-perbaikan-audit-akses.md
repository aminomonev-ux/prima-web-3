# CONCEPT — Perbaikan Audit Akses & Sakelar (Fase F, Tahap 13–17)

> Lanjutan `docs/CONCEPT-pusat-akses-satu-pintu.md` (Tahap 1–12, selesai 2026-09-11).
> Sumber: audit keamanan + code review modul Admin Panel dan commit 2026-09-09..09-11.
> 18 temuan, 11 di antaranya dibuktikan langsung di aplikasi berjalan.

---

## 1. Kenapa dokumen ini ada

Tahap 1–12 membereskan pertanyaan **"siapa boleh masuk"**. Registry membuang delapan
daftar modul yang ditulis tangan; Pusat Akses membuang tiga modal yang bisa berhenti di
tengah; sakelar akhirnya menutup API, bukan cuma mengabukan kartu.

Yang TIDAK ikut selesai adalah pertanyaan kedua: **"modul ini sedang apa"**. Jawabannya
hari ini dihitung di **lima tempat berbeda**, dan tidak satu pun memaksa yang lain:

| Pembaca | Kunci yang ditanyakan | Tahu sub-sakelar? |
|---|---|---|
| `modulMati()` di tiap `_guard.ts` | `[global, modul, sub?]` | **ya** (`bludMati(role,'realisasi')`) |
| `infoBeku()` di layout | `[global, modul]` | tidak |
| `modulDibekukan()` di `izin-server.ts` | `[global, modul]` | tidak |
| `sakelarKartu()` di `menu-client.tsx` | `[global, 'app_status_'+id]` | tidak |
| `buktikan()` di `/maintenance` | `[global, modul, induk]` | sebagian |

Satu-satunya yang lengkap adalah yang menolak permintaan. Keempat lainnya yang
BERBICARA kepada orang. Itulah bentuk seluruh temuan berat di audit ini: **pagarnya
benar, kalimatnya salah** — dan kalimat yang salah selalu condong ke arah yang sama,
yaitu membuat keadaan terlihat lebih normal daripada sebenarnya.

Ini bukan pengulangan T-1. T-1 adalah "tombolnya ada tapi tidak menutup apa pun".
Sekarang kebalikannya: **menutup tapi tidak mengatakannya.**

---

## 2. Tiga benang merah

Delapan belas temuan bukan delapan belas pekerjaan. Ada tiga sebab, dan sisanya
kebersihan.

### 2.1 Satu pertanyaan, lima penjawab — dan yang salah selalu layarnya
T1 · T12 · T13 · T14 · T18 (dan T3 adalah alasan kenapa tidak ada yang menyadarinya)

Bekukan `app_status_blud_realisasi` sendirian, dan **terbukti di aplikasi**: kartu BLUD
di `/menu` tetap `LIVE`, `/blud/buku-kas` tanpa satu spanduk pun, sementara tiap tulisan
ke `/api/blud/realisasi/*` dijawab 503. Lencana IKI di sebelahnya benar-benar berbunyi
`BEKU` — jadi mekanismenya jalan; ia cuma tidak menengok sub-sakelarnya.

Registry SUDAH menyimpan datanya (`subSakelar`, `MENU_REALISASI`). Yang belum ada:
satu fungsi yang menjawab *"kunci sakelar mana yang mengatur layar ini"*, dan kelima
pembaca memanggilnya.

### 2.2 Aplikasi mengatakan hal yang tidak benar
T6 · T11 · T12 · T17

Bukan bug tampilan — ini jejak audit dan petunjuk perbaikan yang **dipercaya orang**:

- `asal_paket: { diubah: 1 }` di-hardcode → baris `ACCESS_GRANT` selalu berbunyi
  "1 hal diubah" berapa pun yang disunting.
- Lima kalimat `tindakan` di Pemeriksaan menunjuk **"tab Pengguna"** dan **"tab Akses
  Menu"** — keduanya sudah tidak ada; namanya sekarang Pusat Akses dan Peran.
- `SpandukBeku` berbunyi *"tombolnya masih bisa ditekan"* — benar di enam modul, **salah
  di BLUD & PK** yang justru menyembunyikan tombolnya. Di layar yang sama muncul spanduk
  kedua: *"**Peran Anda** boleh membaca… Hubungi pemegang menu ini"* — menyalahkan peran
  untuk sesuatu yang sebetulnya sakelar sementara, lalu mengirim orang ke pihak yang
  tidak bisa membantunya.
- T17 paling melingkar: Pemeriksaan menyuruh membuang centang yang kotaknya **sudah mati**
  (`bisaDicentang: []` untuk ADMIN), dan satu-satunya yang benar-benar membuangnya adalah
  efek samping Simpan — yang memaksa admin mengetik alasan P9 dan menulis
  `ACCESS_REVOKE: -dashboard, blud, rencana_aksi` untuk pintu yang tidak bergerak
  sesenti pun.

### 2.3 Pintu kedua
T2 · T5 · T7

`set-app-access` dibuang di Tahap 7 dengan alasan yang benar: *"pintu kedua yang melewati
aturan barunya membuat aturan itu jadi hiasan."* Tiga pintu lain tertinggal.
`DELETE /api/admin/users` **terbukti live** masih sampai ke pencarian target tanpa
diminta `mode` maupun `alasan` — nol pemanggil, tapi tombol yang hilang dari layar bukan
berarti jalurnya tertutup (L82).

### 2.4 Sisanya: kebersihan & pemasangan
T8 · T9 · T10 · T15 — tidak punya benang merah, tidak perlu dipaksakan punya.

---

## 3. Aturan yang dipegang seluruh fase ini

1. **Nol endpoint tulis baru.** Aturan 11.1 tetap berlaku; semua perbaikan di bawah
   mengubah yang sudah ada atau membuang, tidak menambah jalur.
2. **Nol tabel, nol kolom, nol migrasi.** Seluruh datanya sudah ada.
3. **Layar tidak boleh menghitung sendiri.** Tiap jawaban yang ditampilkan harus datang
   dari fungsi yang sama dengan yang menolak permintaannya.
4. **Kegagalan memuat tidak boleh terbaca sebagai "semuanya normal".** Arah gagal selalu
   ke sisi yang lebih membatasi, atau ke "tidak diketahui" yang dikatakan apa adanya.
5. **Pagar di API, bukan di tombol** (L82) — tetap. Yang ditambahkan cuma yang terlihat.

---

## 4. Tiga keputusan yang perlu diambil sebelum kode disentuh

### K1 — Saat modul beku, tombol simpan disembunyikan atau dibiarkan gagal?

Hari ini **dua-duanya**, dan itulah T12. BLUD & PK menyembunyikan (lewat `jepitBeku` yang
menjepit izin `EDIT→LIHAT`); tujuh modul lain membiarkan hidup.

Fakta yang menentukan, dan sudah diukur:

- `bludMati` dipanggil **sebelum** `bolehEditMenu` di route (`dpa/route.ts` POST baris 5
  vs 7) → API sudah menjawab 503 yang benar. `jepitBeku` **murni urusan layar**;
  mencabutnya nol konsekuensi server.
- 92 handler tulis di sembilan modul, **0** yang tidak memanggil penjaganya sendiri.
  Jadi membiarkan tombol hidup tidak membuka apa pun.
- Menyembunyikan lewat izin **mencampur dua pertanyaan** — "siapa Anda" dan "modulnya
  sedang apa" — yang komentar di `guard.ts` sendiri melarang, dan yang sudah melahirkan
  spanduk saling bertentangan di T12.

| Pilihan | Untung | Rugi |
|---|---|---|
| A · Sembunyikan di semua modul | orang tidak mengetik sia-sia | butuh lapis izin per-menu yang cuma dipunyai BLUD & PK; tujuh modul lain harus dibangunkan lapisnya — kerja besar demi menjawab pertanyaan di tempat yang salah |
| B · Biarkan gagal di semua modul | seragam, nol lapis baru, cabut `jepitBeku` saja | orang bisa mengetik satu jam lalu ditolak |
| **C · Tombol terlihat tapi `disabled` + tooltip** | menjawab keduanya, dan TIDAK lewat izin — lewat prop `beku` yang sudah dioper ke sembilan layar | tiap layar harus meneruskan `beku` ke tombol utamanya (sembilan layar, satu prop) |

**Rekomendasi: C.** Ia satu-satunya yang membuat kalimat `SpandukBeku` benar untuk semua
orang tanpa memindahkan "modulnya sedang apa" ke dalam matriks izin. Kalau C dianggap
terlalu luas untuk sekarang, **B** — bukan A: A memperbesar percampuran yang justru jadi
sebab T12.

**DIPUTUSKAN (2026-09-14): C.**

### K2 — Pesan pemeliharaan boleh dibaca sebelum login?

`/maintenance` ada di `PUBLIC_ROUTES`. **Terbukti live**: `credentials:'omit'` → HTTP 200,
badannya memuat nama modul, dan sejak P6 ikut memuat `app_status_*_pesan` — teks bebas
tulisan SUPER_ADMIN. Dua jawaban sah:

- **Ya** (biarkan): halaman pemeliharaan memang untuk dibaca orang yang belum tentu
  login. Cukup dicatat sebagai keputusan, plus satu kalimat pengingat di layar Sakelar
  bahwa yang ditulis di situ terbaca publik.
- **Tidak**: nama modul & pesan hanya untuk sesi sah; yang lain dapat halaman umum.

Ini kebijakan, bukan teknis. Saya tidak merekomendasikan salah satu.

**DIPUTUSKAN (2026-09-14): Ya — dan lebih jauh.** Pemberitahuan pemeliharaan tampil di
**halaman login** itu sendiri, bukan cuma di `/maintenance`. Login tetap bisa walau satu
modul sedang maintenance; orangnya sudah tahu sebelum masuk. Konsekuensinya:

- Hanya `maintenance` yang diumumkan. `readonly` (BEKU) **tidak** — modul beku masih bisa
  dibuka & dicetak (P5), mengumumkannya di pintu depan membuatnya terbaca seperti mati.
- Sakelar global maintenance tidak berubah perilakunya; halaman login cuma ikut
  menyebutnya.
- Layar Sakelar wajib menulis bahwa keterangan pemakai **terbaca sebelum login**.

### K3 — Grant mubazir dibersihkan otomatis atau ditawarkan?

T17. Membersihkan otomatis = wewenang berubah tanpa manusia menekan apa pun — dilarang
oleh aturan modul ini sendiri (§12 P10: *"layarnya MELAPORKAN, tidak membereskan"*).
**Rekomendasi: ditawarkan.** Pemeriksaan menyediakan tombol yang membuka Pusat Akses
orang itu dengan centang mubazirnya sudah terlepas — yang menekan Simpan tetap manusia,
dan `AlasanWajibError` tidak menyalak karena pintunya memang tidak bergeser.

**DIPUTUSKAN (2026-09-14): ditawarkan.**

---

## 5. Tahap pengerjaan

Lima tahap. Urutannya bukan selera: **Tahap 13 memblokir Tahap 14** (keputusan K1 pilihan
B/C baru aman kalau galatnya sudah terbaca), dan Tahap 14 memblokir Tahap 16 (kalimat baru
harus berdiri di atas perilaku yang sudah diputuskan).

### Tahap 0 — Pra-syarat pemasangan (tanpa kode, kerjakan lebih dulu)

Bukan basa-basi: dua di antaranya sedang berlaku sekarang.

1. `node scripts/cek-tahap-0.mjs` di **server kantor**. Di workspace ini ia keluar dengan
   kode 255: `app_status_dashboard = maintenance` sejak **3 Agustus 2026** — disetel waktu
   sakelarnya belum menggigit, sekarang menggigit. Dashboard tertutup untuk semua orang
   selain SUPER_ADMIN, dan SUPER_ADMIN tidak melihatnya karena kartunya hijau untuk dia.
2. `SELECT @@sql_mode` di server kantor. Di sini `STRICT_TRANS_TABLES` + `NO_ZERO_DATE`
   aktif, jadi T10 cuma rollback. Kalau di sana longgar, T10 naik jadi "bisa menyimpan
   `0000-00-00` lalu cron mencabut akses orang" — dan urutannya berubah: T10 pindah ke
   Tahap 13.
3. Buang 3 kunci yatim di `app_config` (`app_status_jp_renbang`, `app_status_kinerja`,
   `app_status_probis`) — tidak ada modulnya, tidak terbaca siapa pun.
4. Kembalikan sakelar sisa pengujian ke ONLINE (`app_status_blud_realisasi`,
   `app_status_iki`).

**DoD:** `cek-tahap-0.mjs` keluar dengan kode 0.

**SELESAI di basis data dev (2026-09-14)**, atas izin pemilik ("boleh otak-atik sakelar,
boleh menghapus yang 100% tidak terpakai"):
- Nomor 3: ketiga kunci dibuktikan tak dirujuk kode mana pun (hanya seed + migrasi lama),
  lalu dibuang dari DB, dari seed `docs/schema-mysql.sql`, dan dibawakan
  `docs/migrations/migration-hapus-sakelar-yatim.sql` untuk server kantor.
- Nomor 4: `blud_realisasi` & `iki` kembali ONLINE. Dashboard (T8) ikut dinyalakan lewat
  Admin Panel supaya tercatat di jejak audit.
- `cek-tahap-0.mjs` keluar 0. Skripnya diperbaiki: baris `_pesan`/`_sampai` dulu ikut
  ditandai `!!` seolah sakelar mati.
- **Nomor 1 & 2 tetap menunggu server kantor** — basis data di sana isinya lain.

---

### Tahap 13 — Kalimat kegagalan sampai ke orangnya
**Menutup: T3, T18.** Paling kecil, dan membuka semua yang lain.

**13a · `fetchJson` membaca `error`.**
`lib/security/guard.ts` memulangkan `{ ok:false, code, error }`; `lib/shared/api.ts:39`
cuma membaca `body.message`. Akibatnya kalimat pembekuan & pemeliharaan yang ditulis
susah payah di P5/P6 **tidak pernah sampai** ke PK, Renaksi, IKI, LKJIP, BBA, E-Anggaran,
Dashboard, Usulan, dan Admin Panel — yang muncul `HTTP 503 Service Unavailable`. Hanya
BLUD yang selamat, dan itu kebetulan: kliennya membaca `json.error`.

Perbaikan: `(body.message as string) || (body.error as string) || …`. Satu baris.
Tambahan: klien mengenali `code === 'MODUL_BACA_SAJA'` dan memunculkan spanduk, bukan
toast merah — `grep` ke seluruh `app/ components/ lib/` hari ini memulangkan **nol**
pemakai kode itu di luar `guard.ts`.

**13b · `/menu` berhenti fail-open.**
`menu-client.tsx:183-191` membungkus dua fetch dalam satu `Promise.all(...).catch(() => {})`.
Satu gagal → **kedua** hasil dibuang diam-diam → `appStatus = {}` dan `userAccess = null`.
Terukur langsung dalam sesi audit ini (saat `/api/user/access` sempat 404 karena dev
server basi — bukan cacat kode, dan tidak dilaporkan sebagai temuan):

| | saat gagal | sesudah pulih |
|---|---|---|
| Dashboard (maintenance) | `LIVE` | `MAINTENANCE` |
| BLUD (readonly) | `LIVE` | `BEKU` |
| IKI (readonly) | `LIVE` | `BEKU` |

Dan karena `userAccess === null` membuat `isLocked()` memulangkan `false` untuk setiap
kartu, lencana TERKUNCI tidak pernah muncul — bersamanya tautan **"Minta akses"**, yaitu
seluruh Tahap 11, tidak pernah bisa ditemukan orang.

Perbaikan: pisahkan kedua pemuatan (`allSettled` atau dua efek), dan kartu yang statusnya
**tidak diketahui** jangan berbunyi `LIVE` — beri keadaan ketiga yang mengatakannya.
Pagarnya tidak jebol (route tetap menolak); yang jebol janji P6.

**DoD:** dengan `/api/user/access` sengaja dimatikan, kartu MAINTENANCE tetap tidak
berbunyi LIVE. `scripts/test-tahap-13.mts` — termasuk uji mutasi yang mengembalikan
`.catch(() => {})` dan mengembalikan `body.message` polos.

**SELESAI (2026-09-14).** Dua penyimpangan dari rencana, keduanya ditemukan saat kode dibaca:

- **Lacinya tiga, bukan dua.** LKJIP membaca `msg` (`app-guard.ts` sengaja
  mempertahankannya), IKI membaca `message` lewat `fetch` mentah. Menambal `fetchJson` saja
  tetap meninggalkan LKJIP & IKI buta. Karena itu yang diperbaiki **sumbernya**:
  `balasSakelar` di `guard.ts` mengisi `error` + `message` + `msg` sekaligus. Laci lama tidak
  berubah, jadi nol klien disentuh. `fetchJson` tetap ikut membaca ketiganya (`pesanDari`)
  dan meneruskan `code`.
- **Spanduk otomatis untuk `MODUL_BACA_SAJA` di klien TIDAK dibuat.** Halaman yang dibuka
  saat modul beku sudah memasang `SpandukBeku` dari server (6089c82), dan K1=C (Tahap 14)
  mematikan tombolnya. Yang tersisa cuma modul yang dibekukan SAAT halaman terbuka, dan
  untuk itu kalimat 503 yang kini terbaca di toast sudah menjawab. `code` diteruskan
  supaya bisa dibangun belakangan tanpa menyentuh `fetchJson` lagi.

`/menu`: aturan kartu pindah ke `app/(dashboard)/menu/_kartu-sakelar.ts` (berkas daun, bisa
diuji perilakunya). Dua keadaan baru: `memuat` → lencana MEMUAT, `tak-terbaca` → BELUM
TERBACA + tooltip, plus spanduk dengan tombol **Coba lagi**. Akses yang gagal dimuat tidak
dikarang terkunci: menandai semua kartu terkunci menyuruh orang meminta akses yang sudah ia
punya.

Uji: 43 pemeriksaan, **12/12 mutasi tertangkap**. Tahap 4–12 tetap lulus (dua asersi lama
disesuaikan: Tahap 9 mengutip bentuk balasan beku, Tahap 12 membaca `sakelarKartu` dari
berkas barunya). Peramban (SUPER_ADMIN): status gagal → sembilan kartu BELUM TERBACA +
spanduk; Coba lagi → Dashboard kembali MAINTENANCE; `/api/user/access` gagal → Dashboard
tetap MAINTENANCE. Penggagalnya dipasang di `window.fetch` klien, server tidak disentuh.

---

### Tahap 14 — Satu daftar kunci sakelar per layar
**Menutup: T1, T12, T13, T14.** Inti fase ini.

**14a · Registry menjawab "kunci mana yang mengatur layar ini".**
Fungsi baru di `lib/registry/apps.ts` (berkas nol-impor, jadi aman dibaca komponen
`'use client'` maupun skrip CI):

```
kunciSakelarUntuk(modulKunci, menuKunci?) -> string[]
```

Untuk BLUD + menu di `MENU_REALISASI` → `[app_status_blud, app_status_blud_realisasi]`;
selain itu → `[app_status_blud]`. Global disisipkan `kunciDenganGlobal` seperti sekarang.

Kelima pembaca memanggilnya: `modulMati` (sudah, lewat `bludMati(role,lingkup)` — bentuknya
disamakan), `infoBeku`, `modulDibekukan`, `sakelarKartu`, `buktikan`. **T14 ikut selesai di
sini**: `sakelarKartu` berhenti merangkai `app_status_${id}` sebagai teks.

Kartu `/menu` untuk modul bersub-sakelar menyatakan keadaan **terburuk** di antara
sub-sakelarnya — kalau satu sub beku, kartunya BEKU, dan kalimatnya menyebut bagian mana.

**14b · Keputusan K1 dijalankan.** Kalau C: `jepitBeku` dicabut dari kedua `izin-server.ts`
(izin kembali menjawab "siapa Anda" saja), `beku` diteruskan ke tombol utama di sembilan
layar sebagai `disabled` + tooltip, dan `SpandukBeku` berhenti menebak — kalimatnya
mengikuti apa yang benar-benar terjadi. `SpandukLihat` tidak lagi muncul karena pembekuan.

**14c · `bisaBeku` diturunkan dari kenyataan** (T13). Hari ini ia berarti "punya `dirApi`
dan punya `penjagaApi`", jadi **Dashboard menawarkan BEKU** padahal kedua route-nya GET
saja — terbukti live: tombol BEKU Dashboard `disabled: false`, sementara dua sakelar RIMA
`disabled: true` dengan tooltip `SEBAB_TAK_BISA_BEKU`. Mekanismenya sudah ada dan bekerja;
ia cuma tidak berlaku untuk modul. Diturunkan dari ada-tidaknya handler tulis di `dirApi`
(pemindaian yang sama dengan gate G).

**14d · Gate G naik ke per-handler.** `scripts/test-killswitch-modul.mjs` hari ini
memeriksa `isi.includes(penanda)` — **per berkas**. Sebuah `route.ts` yang mengekspor
GET+POST+PUT dan memanggil `bludMati` hanya di GET tetap lulus. Hari ini kebetulan aman
(92 handler tulis, 0 tanpa penjaga di badannya), tapi K1 pilihan B/C membuat `modulMati`
satu-satunya yang menahan tulisan — jaminannya harus per-handler, bukan kebetulan.

**DoD:** matriks (induk × sub) × (online/readonly/maintenance) diuji, dan yang dibandingkan
**jawaban API vs apa yang layar tampilkan** — bukan pencocokan teks sumber.
`scripts/test-tahap-14.mts`. Gate G per-handler lulus dengan 0 temuan.
Verifikasi peramban wajib dengan akun **non-SUPER_ADMIN** (`PERAN_TEMBUS_SAKELAR` membuat
SUPER_ADMIN buta terhadap seluruh tahap ini).

**SELESAI (2026-09-14).** Yang berbeda dari rencana, semuanya ditemukan saat dikerjakan:

- **K1=C jauh lebih luas dari "sembilan layar, satu prop".** BLUD punya 12 layar dan PK 7
  yang tidak menerima `beku` — hanya shell-nya. Karena itu tombol tidak dimatikan lewat prop
  per layar, melainkan lewat **konteks**: `KunciTulisProvider` (shell BLUD/PK + `page.tsx`
  tujuh modul lain) dan prop `menulis` di `PrimaButton`. 46 tombol tulis ditandai; suite
  menggagalkan tombol ber-ikon `Save` di modul bersakelar yang lupa ditandai.
- **`aria-disabled`, bukan `disabled`.** `.btn-prima:disabled` ber-opacity .45 yang ikut
  memudarkan tooltip `::after`, dan tombol `disabled` tak bisa difokus keyboard. Klik dicegat
  (`preventDefault`, ikut menahan submit form).
- **Tooltip terpotong, terukur di peramban.** Kalimat pertama 745px `nowrap` dipusatkan pada
  tombol Simpan di tepi kanan → separuhnya di luar layar. Kalimat dipendekkan; tooltip tombol
  terkunci boleh berbaris (maks 240px) dan dijangkarkan ke tepi kanan tombol.
- **Pencabutan `jepitBeku` dibuktikan aman lebih dulu**, bukan diasumsikan:
  `scripts/cek-urutan-penjaga.mjs` (kini bagian `check:killswitch`) memeriksa di 33 handler
  tulis BLUD/PK bahwa penjaga sakelar mendahului `bolehEditMenu`/`bolehInput`/data.
- **`infoBeku` & `/maintenance` mengambil kalimat dari kunci yang DITANYAKAN, bukan yang
  MENYEBABKAN** — cacat tambahan di jalur 14a. `InfoBeku.bagian` baru; spanduk berbunyi
  "BLUD — Realisasi sedang dibekukan." `/maintenance` belum disentuh (masuk Tahap 17 bersama K2).
- **`MENU_REALISASI` dibuang** dari `lib/blud/peran.ts`; daftar menunya pindah ke
  `subSakelar.menu` di registry (satu jawaban, L88).
- **14c:** `hanyaBaca` di registry, dicocokkan gate G ke handler tulis sungguhan dua arah.
- **14d:** gate G per handler, termasuk GET; bentuk ekspor yang tak dikenali digagalkan.
  95 route · 156 handler · 0 bolong.

Uji: `scripts/test-tahap-14.mts` 72 pemeriksaan (matriks 27 kombinasi global×induk×sub,
`PrimaButton` dirender sungguhan), **14/14 mutasi tertangkap** (satu sempat LOLOS: merangkai
`app_status_${id}` memberi hasil sama untuk semua modul hari ini, jadi hanya bisa dijaga
statis). Gate G 4/4 + `hanyaBaca` 2/2 + urutan penjaga 1/1 mutasi tertangkap. Tahap 4–13
tetap lulus; Tahap 9/12/13 disesuaikan ke kontrak baru (Tahap 9 bagian D dulu menegaskan
jepitan yang kini dibuang).

Peramban: Sakelar — BEKU Dashboard mati bertooltip (dulu hidup). `blud_realisasi` beku
sendirian → kartu BLUD "SEBAGIAN BEKU" + catatan (dulu LIVE), Buku Kas berspanduk "BLUD —
Realisasi sedang dibekukan" (dulu tanpa spanduk), DPA tanpa spanduk. `blud` beku, akun
**uji.program**: DPA — spanduk tunggal "Tombol simpan dimatikan…", Simpan tampil ber-
`aria-disabled` + tooltip di dalam layar (863–1103px dari 1150), tanpa `SpandukLihat`, klik →
nol permintaan tulis. SUPER_ADMIN: Simpan tetap hidup, spanduk berkalimat "kecuali untuk
Anda". Semua sakelar dikembalikan ONLINE.

---

### Tahap 15 — Pintu kedua ditutup
**Menutup: T2, T5, T7, T10.**

**15a · `DELETE /api/admin/users` dibuang** (T5), bukan ditambal alasannya — dua pintu
hapus berarti dua set aturan. Nol pemanggil tersisa (`TabUserMgmt.tsx` sudah dibuang di
Tahap 5). Ditambah pemeriksaan statis: `DELETE FROM users` hanya boleh muncul di
`lib/admin/pusat-akses.ts`.

**15b · `/api/upload` masuk jangkauan sakelar** (T2). Berkas itu dipakai **dua** modul
(LKJIP `editor-client.tsx`, Usulan `BuatPanel.tsx`) dan tidak memanggil `modulMati` sama
sekali — jadi mematikan atau membekukan salah satunya tidak menghentikan unggahan ke
Drive maupun baris `uploaded_files`. Gate G tidak bisa melihatnya karena registry memberi
tiap modul **satu** `dirApi`.

Dua jalan: (a) `dirApi` jadi larik dan `app/api/upload` didaftarkan ke dua modul, atau
(b) route menerima penanda modul asal lalu memanggil penjaga yang sesuai.
**Rekomendasi (b)** — (a) memaksa satu berkas menyebut dua penanda berbeda, dan gate G
jadi harus mengerti "cukup salah satu", yang melemahkannya untuk semua modul lain.

**15c · Lantai SUPER_ADMIN berhenti berdiri di nilai kiriman klien** (T7).
`app/api/admin/pusat-akses/route.ts:189` menolak berdasarkan `b.role_awal`. Hari ini tidak
bisa ditembus — `PeranBerubahError` di dalam transaksi menangkapnya — tapi ia selamat
karena pagar lain, bukan karena dirinya. Pindah ke dalam `simpanBerkasOrang`, memakai
`target.role` hasil `SELECT … FOR UPDATE`. `role_awal` tetap dipakai untuk deteksi layar
basi: dua pertanyaan, dua sumber.

**15d · Tanggal berjangka divalidasi sungguhan** (T10). `^\d{4}-\d{2}-\d{2}$` meloloskan
`2026-13-45`. Di basis data ini `STRICT_TRANS_TABLES` + `NO_ZERO_DATE` membuatnya
ER_TRUNCATED_WRONG_VALUE → **rollback seluruh Simpan** (peran + pintu + menu) dengan pesan
*"Terjadi kesalahan server."* Diperbaiki di skema Zod **dan** di `RE_TANGGAL` berkas daun,
supaya layar menolak lebih dulu. Kalau Tahap 0 nomor 2 menemukan server kantor tidak
strict, butir ini naik ke Tahap 13.

**DoD:** `scripts/test-tahap-15.mts` + gate statis `DELETE FROM users`.

**SELESAI (2026-09-14).**
- **15a** — `DELETE` di `app/api/admin/users/route.ts` dibuang; pintu hapus tunggal ternyata
  di `app/api/admin/pusat-akses/route.ts` (bukan `lib/admin/pusat-akses.ts` seperti tertulis
  di atas). Suite memindai `app/` + `lib/`: `DELETE FROM users` tepat satu tempat. Live:
  `DELETE /api/admin/users` → **405**.
- **15b** — rekomendasi (b): pemanggil mengirim `modul` (`lkjip` ×3, `usulan_aset` ×1), route
  memanggil `modulMati(kunciSakelarUntuk(modul))` SEBELUM file dibaca. `modul` tak disebut
  (tab lama sebelum deploy) → semua sakelar pemakai ditanya, bukan ditolak 400. Live,
  **uji.program** saat LKJIP beku: **503 `MODUL_BACA_SAJA`**, kalimat di tiga laci — ini
  sekaligus membuktikan T3 yang dulu belum terverifikasi. Sengaja tidak dicoba `modul=usulan_aset`
  (akan benar-benar mengunggah ke Drive). Catatan: `/api/upload/download` (GET) tetap di luar
  sakelar — dipakai lintas modul untuk MEMBACA; menutupnya saat maintenance butuh tahu file
  itu milik modul mana (kolom `context` belum diisi pemanggil). Tidak dikerjakan di fase ini.
- **15c** — `LantaiSuperAdminError` di dalam `simpanBerkasOrang`, dari `target.role` hasil
  `FOR UPDATE`, SEBELUM pemeriksaan layar basi. Diuji terhadap basis data sungguhan: akun
  SUPER_ADMIN + `roleAwal` palsu ditolak dan tak satu baris pun berubah.
- **15d** — `tanggalSah` di `lib/admin/berjangka-baris.ts` (bulak-balik `Date.UTC`), dipakai
  Zod, `jangkaYangBerarti`, `sisaHari`, `tanggalSingkat` (dulu menampilkan "45 13 2026").

Uji: `scripts/test-tahap-15.mts` 36 pemeriksaan (jalankan `--env-file=.env.local`), **9/9
mutasi tertangkap**. Tahap 5 & 10 disesuaikan (keduanya mengutip bentuk lama).

---

### Tahap 16 — Kalimat yang benar
**Menutup: T6, T11, T17, T19.** Sengaja SESUDAH Tahap 14: kalimat baru harus menjelaskan
perilaku yang sudah diputuskan, bukan perilaku yang sebentar lagi berubah.

**16a · Jejak audit berhenti mengarang** (T6). `TabPusatAkses.tsx:400` mengirim
`diubah: 1` mati. Dihitung sungguhan (bandingkan draf sesudah paket diterapkan dengan draf
saat Simpan) — atau medannya dibuang. Angka karangan di jejak audit lebih buruk daripada
tidak ada angka, karena ia dipercaya.

**16b · Petunjuk menunjuk tempat yang ada** (T11). Lima kalimat `tindakan` di
`lib/admin/pemeriksaan.ts` (baris 170, 179, 188, 197, 227) menyebut "tab Pengguna" dan
"tab Akses Menu". Rel Admin Panel hari ini: Pusat Akses · Peran · Permintaan · Tinjauan ·
Sakelar · Sesi Aktif · Monitor · Status · Jejak Audit · Pemeriksaan · Broadcast · Email ·
RIMA. Diuji dengan mencocokkan ke daftar tab yang sebenarnya, bukan diperbaiki sekali lalu
dibiarkan basi lagi.

**16c · Grant mubazir punya jalan keluar yang nyata** (T17, keputusan K3).
Terukur pada `tesujiakun` (ADMIN): `app_access` menyimpan `['dashboard','blud','rencana_aksi']`
sementara `bisaDicentang` **kosong sama sekali** — peran ADMIN sudah membuka kesepuluh
modul, jadi tidak satu kotak pun bisa dicabut di layar. Satu-satunya yang benar-benar
membuangnya adalah efek samping Simpan, yang memaksa alasan P9 dan menulis
`ACCESS_REVOKE` untuk pintu yang tidak bergerak.

Perbaikan: `grantYangBerarti` yang menggugurkan kunci mubazir berhenti dihitung sebagai
**pencabutan** — ia pembersihan, dan jejaknya harus mengatakan itu (jenis peristiwa atau
kalimat detail yang berbeda), serta tidak memicu `AlasanWajibError`. Ditambah tombol di
Pemeriksaan yang membuka Pusat Akses orang itu dengan centangnya sudah terlepas.

**16d · Daftar Pusat Akses tidak berbunyi kosong saat belum/gagal dimuat** (T19, ditemukan
2026-09-14 saat Tahap 0). `TabPusatAkses.tsx:150` — `if (j.ok && j.data) setDaftar(j.data)`
tanpa cabang gagal, dan `daftar` berawal `[]`. Akibatnya selama dimuat, dan SELAMANYA kalau
pemuatannya gagal, layar berbunyi "Tidak ada yang cocok · 0 orang". Bentuk T18: kegagalan
terbaca sebagai hasil. Keadaan tiga (`memuat`/`gagal`/`ada`) + kalimat gagal + Coba lagi.

**DoD:** `scripts/test-tahap-16.mts`, termasuk uji mutasi yang mengembalikan `diubah: 1`.

**SELESAI (2026-09-14).**
- **16a** — `hitungSuntinganPaket` (berkas daun `lib/admin/jejak-paket.ts`): layar memotret isi
  form sesaat sesudah paket diterapkan, dan saat Simpan menghitung pintu + sel izin yang
  berbeda. Draf mentah dibandingkan dengan draf mentah (versi pertama membandingkan draf
  mentah dengan grant tersaring → pintu dari peran terhitung suntingan; dikoreksi sebelum uji).
- **16b** — lima `tindakan` ke tab yang ada (Pusat Akses / Peran). Saat dibuka di layar
  ketahuan DUA rujukan hantu lain yang tidak disebut konsep: `ringkas` temuan mubazir
  ("lewat Atur Akses") dan daftar menu Admin Panel yang dipakai RIMA
  (`lib/sentinel/module-menus.ts`: App Control, User Management, Active Sessions, …). Keduanya
  diperbaiki; suite kini mencocokkan SELURUH teks temuan dan daftar RIMA ke label rel
  `admin-client.tsx`.
- **16c** — keputusan K3 (ditawarkan). Server: `grantBergeser` & `grantDicabut` dihitung dari
  grant lama yang BERARTI (`grantYangBerarti(target.role, …)`); grant mubazir yang terlepas
  masuk `grantDibersihkan`, dicatat `USER_UPDATE` "dibersihkan", tanpa alasan. Layar Pusat
  Akses: spanduk "N pemberian akses tidak menambah apa-apa" + tombol **Lepas centangnya**
  (mengisi form saja). Pemeriksaan: tombol **Buka {nama}** per orang. Penyimpangan kecil dari
  konsep: centangnya TIDAK dilepas otomatis saat dibuka dari Pemeriksaan — satu klik
  tambahan, supaya draf tidak pernah berubah tanpa tindakan yang terlihat.
- **16d** (T19) — daftar Pusat Akses tiga keadaan; gagal memuat berbunyi "gagal dimuat" +
  Coba lagi, jumlah orang hanya ditulis saat data ada.

Uji: `scripts/test-tahap-16.mts` 36 pemeriksaan (`--env-file=.env.local`), **11/11 mutasi
tertangkap**. Uji basis data pada `tesujiakun` (ADMIN, 3 grant mubazir): simpan tanpa alasan
lolos, `dicabut=[]`, `dibersihkan=[blud,dashboard,rencana_aksi]`; `app_access` dipulihkan
sesudahnya. Peramban: Pemeriksaan → Buka tesujiakun → spanduk → Lepas centangnya → Simpan
menyala. **Simpan sengaja tidak ditekan** (akun sungguhan); jalur servernya dibuktikan uji
basis data. Tahap 7 disesuaikan (mengutip pembanding lama).

---

### Tahap 17 — Kebersihan & pemasangan
**Menutup: T9, T15.**

- **T9 · K2 = pemberitahuan di halaman login.** `app/(auth)/login/page.tsx` itu komponen
  klien (`'use client'`), jadi ia tidak bisa membaca `app_config`. Halamannya dipecah:
  `page.tsx` jadi server component yang membaca daftar modul maintenance lalu mengoper ke
  formulir klien sebagai prop — **nol endpoint publik baru**. Daftarnya dihitung lewat
  pembaca yang SAMA dengan `/maintenance` (`sebabTerburuk` + `kunciDenganGlobal`, yang
  Tahap 14 satukan); pembaca keenam yang menulis rumusnya sendiri adalah bentuk persis
  T1/T14. Gagal membaca DB = tidak ada spanduk (pola `buktikan`), login tetap jalan.
  Plus kalimat "terbaca sebelum login" di layar Sakelar.
- **T9 (lanjutan)** · `@import` ke `fonts.googleapis.com`
  di `app/maintenance/page.tsx` dibuang — **terbukti live** diblokir CSP kita sendiri
  (`style-src 'self' 'unsafe-inline'`), jadi 'Exo 2' & 'Share Tech Mono' tidak pernah
  termuat dan tiap kunjungan melempar galat CSP. Diturunkan ke `next/font` atau stack
  sistem.
- **T15** · `app_status_global` diseed di `docs/schema-mysql.sql` seperti sakelar lain,
  supaya basis data yang lahir dari berkas acuan tidak punya satu sakelar tanpa baris.
- Panduan pemasangan menyebut dua pemeriksaan Tahap 0 (`cek-tahap-0.mjs`, `@@sql_mode`).

**SELESAI (2026-09-14).**
- **K2 di halaman login** — `app/(auth)/login/page.tsx` jadi server component (formulir lama
  dipindah `git mv` ke `login-form.tsx`); daftarnya dari `lib/security/pemeliharaan.ts` →
  `daftarPemeliharaanDari` di registry. Hanya `maintenance`, disaring per PENYEBAB (induk
  disebut sekali; global mati → satu baris). Nol route publik baru (uji mencocokkan
  `PUBLIC_ROUTES` persis). Layar Sakelar kini menulis bahwa keterangannya terbaca sebelum login.
  Live tanpa cookie sesi: "Dashboard sedang dalam pemeliharaan. BLUD sedang dalam
  pemeliharaan. Anda tetap bisa masuk…", formulir tetap ada.
- **`/maintenance` ikut dirapikan** (sisa dari Tahap 14): `keteranganSakelar` di registry
  mengambil nama & kalimat dari sakelar PENYEBAB. Live: `?m=app_status_blud_realisasi` saat BLUD
  dimatikan kini berbunyi **BLUD** (dulu "BLUD — Realisasi" dengan keterangan kosong).
- **Font** — ternyata TIGA berkas, bukan satu: `app/error.tsx` & `app/not-found.tsx` juga
  `@import` Google Fonts (galat CSP yang terlihat di /menu berasal dari `error.tsx`). Diganti
  font lokal `@fontsource` yang sudah dimuat `app/layout.tsx`.
- **T15** — seed ternyata kehilangan LIMA sakelar (global, dashboard, buku_besar_aset, lkjip,
  sentinel_bot). Seed kini = `KUNCI_SAKELAR` (diuji), + `migration-seed-sakelar-lengkap.sql`
  (INSERT IGNORE, dijalankan di dev: 1 baris, `sentinel_bot`).
- Panduan: `cek-tahap-0.mjs` di daftar periksa & sesudah naik versi, `sql_mode` strict,
  pemeriksaan BEKU, dua migrasi fase ini. Satu baris ganda "Nyalakan lagi." ikut dibuang.

Uji: `scripts/test-tahap-17.mts` 34 pemeriksaan, **10/11 mutasi tertangkap** — yang lolos
mutasi SETARA (`return [global]` lebih awal berlebih karena penyaring per penyebab sudah
menyisakan satu baris), jadi barisnya dibuang, bukan ditambal ujinya. Satu asersi saya sempat
selalu-lulus (membandingkan `PUBLIC_ROUTES` dengan dirinya sendiri) dan diganti daftar persis.
Tahap 4/9/12 disesuaikan ke bentuk `/maintenance` yang baru.

---

### Tahap 18 — Bahasa layar Admin Panel & sakelar
**Permintaan pemilik aplikasi (2026-09-14). Dikerjakan TERAKHIR**, sesudah seluruh temuan
selesai — kalimat baru di Tahap 13–17 ikut dirapikan di sini, bukan ditulis dua kali.

**18a · Istilah keadaan sakelar.** Kata **BEKU** diganti. Kandidat (dikonfirmasi pemilik
sebelum Tahap 18 mulai):

| Sekarang | Usulan | Alasan |
|---|---|---|
| ONLINE | **AKTIF** | kata sehari-hari |
| BEKU | **HANYA BACA** | menyebut apa yang masih bisa, bukan kiasan |
| MAINTENANCE | **PEMELIHARAAN** | padanan baku |

Sumbernya satu: `LABEL_KEADAAN` di `lib/registry/apps.ts` — lencana `/menu`, tombol
Sakelar, dan kalimat spanduk wajib membacanya, bukan menulis ulang kata sendiri. Nama di
KODE (`beku`, `jepitBeku`, `SpandukBeku`, kode `MODUL_BACA_SAJA`) **tidak** diubah: tidak
terlihat orang, dan mengganti puluhan pengenal hanya menambah risiko tanpa manfaat.

**18b · Kalimat Admin Panel ditulis ulang.** Lingkup: 15 berkas `app/(dashboard)/admin/**`,
pesan galat 22 route `app/api/admin/**` + `lib/admin/*`, `SpandukBeku`, `SpandukLihat`,
lencana `/menu`, dan spanduk pemeliharaan di halaman login. Komentar kode tidak termasuk.

Patokan yang bisa diperiksa, bukan selera:
- Kalimat pendek; satu kalimat satu maksud. Tanpa tanda pisah panjang (—) di teks layar.
- Tanpa kiasan: *pintu, menggigit, berbohong, jebol, mendarat, sasaran, lantai*.
- Urutan: apa yang terjadi → apa yang masih bisa dilakukan → siapa yang dihubungi.
- Menyapa **Anda**; kata yang dipakai orang kantor, bukan istilah rancangan.
- Istilah teknis (503, `app_access`) tidak muncul di layar pemakai.

**DoD:** daftar kalimat sebelum → sesudah disetujui pemilik lebih dulu; pemeriksaan
statis yang menolak `—` dan daftar kiasan di string JSX/pesan galat berkas lingkup.

---

## 6. Yang sengaja TIDAK dikerjakan

- **Tidak menambah lapis izin per-menu ke tujuh modul** supaya tombolnya bisa
  disembunyikan saat beku. Itu memindahkan "modulnya sedang apa" ke dalam matriks yang
  menjawab "siapa Anda" — percampuran yang justru melahirkan T12.
- **Tidak membersihkan grant mubazir otomatis** (K3). Wewenang tidak berubah tanpa manusia
  menekan sesuatu.
- **Tidak backfill `audit_log.target_user_id`.** Menerka sasaran dari `detail LIKE '%id=N%'`
  adalah persis pencarian salah yang kolom itu ada untuk membuangnya.
- **Tidak menambah endpoint tulis apa pun.** Termasuk untuk Pemeriksaan dan Tinjauan.
- **Tidak melaporkan 404 `/api/user/access`** sebagai temuan — itu dev server basi,
  terbukti pulih setelah restart. Yang dilaporkan akibatnya (T18), bukan sebabnya.
- **Tidak mengubah `PERAN_TEMBUS_SAKELAR`.** SUPER_ADMIN menembus sakelar adalah desain;
  konsekuensinya (ia buta terhadap pembekuan) dijawab kalimat spanduk, bukan dengan
  menutup pintunya sendiri.

---

## 7. Ketergantungan antar tahap

```
Tahap 0  (tanpa kode)  ──┐
                         ├─→ Tahap 13 ──→ Tahap 14 ──→ Tahap 16
Tahap 0 nomor 2 ─────────┘        │            │
   (kalau tidak strict:           │            └──→ Tahap 17
    T10 naik ke 13)               │
                                  └──→ Tahap 15  (bisa paralel dgn 14)
```

- **13 sebelum 14**: keputusan K1 pilihan B/C bertumpu pada galat 503 yang terbaca.
- **14 sebelum 16**: kalimat tidak boleh ditulis untuk perilaku yang sebentar lagi diganti.
- **15 mandiri**: tidak menyentuh jalur sakelar, boleh jalan bersamaan.
- **18 paling akhir**: menunggu 13–17 selesai, supaya kalimat baru tahap-tahap itu ikut
  dirapikan sekali saja.

---

## 8. Ringkasan 18 temuan

| # | Temuan | Tahap | Bukti |
|---|---|---|---|
| T1 | Sub-sakelar Realisasi: layar diam, API 503 | 14 | live · **selesai** |
| T2 | `/api/upload` di luar semua sakelar | 15 | live · **selesai** |
| T3 | Pesan 503 tidak sampai (`error` vs `message`) | 13 | live · **selesai** (13b83af) |
| T4 | Spanduk BEKU absen di 7 modul | — | **selesai** (6089c82) |
| T5 | `DELETE /api/admin/users` tanpa `mode`/`alasan` | 15 | live · **selesai** |
| T6 | `asal_paket.diubah: 1` di-hardcode | 16 | kode · **selesai** |
| T7 | Lantai SA berdiri di `role_awal` klien | 15 | kode · **selesai** |
| T8 | `app_status_dashboard` = maintenance sejak 3 Agu | 0 | live · **dinyalakan** (dev) |
| T9 | `/maintenance` publik + font diblokir CSP sendiri | 17 (K2) | live · **selesai** |
| T10 | Regex tanggal meloloskan `2026-13-45` | 15 | live · **selesai** |
| T11 | Petunjuk menunjuk 5 tab yang tidak ada | 16 | live · **selesai** (+2 rujukan hantu lain) |
| T12 | Spanduk BEKU berbohong di BLUD & PK | 14 (K1) | live · **selesai** |
| T13 | Dashboard menawarkan BEKU yang nihil akibat | 14 | live · **selesai** |
| T14 | `sakelarKartu` merangkai kunci sebagai teks | 14 | kode · **selesai** |
| T15 | `app_status_global` tanpa baris seed | 17 | kode · **selesai** (+4 sakelar lain) |
| T17 | Grant mubazir mustahil dibuang; jejaknya palsu | 16 (K3) | live · **selesai** |
| T18 | `/menu` fail-open: satu fetch gagal → semua LIVE | 13 | live · **selesai** (13b83af) |
| T19 | Pusat Akses: belum/gagal memuat berbunyi "0 orang" | 16 | live · **selesai** |

> T16 tidak dipakai — penomorannya melompat saat temuan digabung; dibiarkan kosong supaya
> nomor yang sudah dirujuk di catatan audit tidak bergeser artinya.

---

## 9. Belum terverifikasi

**Terjawab 2026-09-14 (Tahap 15b):** keduanya dibuktikan live dengan uji.program — lihat
catatan SELESAI Tahap 15. Paragraf di bawah dibiarkan sebagai riwayat.

**T2** dan **T3** belum dibuktikan lewat layar — keduanya butuh percobaan TULIS saat modul
beku. Percobaannya sempat disiapkan di IKI tapi tab peramban membeku berulang kali
(halaman IKI berat di mode dev), dan permintaan tulis lewat `javascript_tool` diblokir
classifier. Keduanya tetap pasti dari kode. Cara membuktikannya satu klik: bekukan IKI,
buka editornya dengan akun non-SUPER_ADMIN, tekan Simpan — yang muncul seharusnya
`HTTP 503 Service Unavailable`, dan itulah T3.
