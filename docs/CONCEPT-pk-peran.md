# KONSEP — Akses per-menu modul Perjanjian Kinerja (PK)

> Status: **✅ DIKERJAKAN 2026-08-03.** Konsep ditulis dan dieksekusi di hari yang sama.
> Catatan hasil ada di §12 — termasuk dua hal yang berubah dari rencana.
> Induk: `docs/CONCEPT-menu-access-control.md` (mekanisme) · `docs/CONCEPT-blud-peran.md` (pola tabel peran).
> Ini modul **kedua** yang memakai mekanisme itu. BLUD yang pertama (Fase 2, selesai 2026-08-01).

---

## 0. Kedudukan dokumen ini

Dokumen induk menaruh PK di **Fase 4** dan Usulan Kebutuhan di Fase 3. Urutannya dibalik,
dengan alasan yang perlu dicatat supaya tidak dipertanyakan lagi nanti:

PK bentuknya **sama persis** dengan BLUD — menu = route sungguhan, jadi pagarnya bisa
memakai pola yang sudah terbukti tanpa satu pun bagian baru. Usulan bentuknya **lain**
(15 panel di dalam satu URL); pagarnya harus dipasang per-route API satu per satu.
Mengerjakan yang sama dulu memisahkan dua pertanyaan yang kalau digabung jadi sulit
dijawab: *"polanya bisa dipakai ulang?"* dan *"pola baru ini jalan?"*. Kalau Usulan
duluan dan ada yang salah, tidak akan jelas salahnya di mekanisme menu-access atau di
cara menjaga panel.

**Catatan lapangan (2026-08-03):** server kantor **belum ada — belum pernah dipasang**.
Seluruh pekerjaan ini, termasuk BLUD Fase 2, hidup di dev lokal. Kotak "periksa server
kantor lebih dulu" di §7 Fase 0 dokumen induk karena itu belum bisa dicentang — bukan
terlewat, memang belum ada yang bisa diperiksa. Ia baru berlaku pada hari pemasangan
pertama.

---

## 1. Masalah

PK hari ini punya **dua tingkat izin, dan keduanya berlaku serentak untuk ketujuh menu**:

| Fungsi | Berkas | Artinya |
|---|---|---|
| `isPkRole` | `lib/data/pk-schemas.ts:64` | boleh masuk modul |
| `isPkEditRole` | `lib/data/pk-schemas.ts:68` | boleh mengubah **apa pun** di dalamnya |

Akibatnya tidak ada kalimat yang bisa diucapkan sistem selain "boleh semua" atau "lihat
semua". Permintaan seperti *"PROGRAM boleh mengisi Form PK, tapi Master Pejabat jangan
disentuh"* hari ini hanya bisa dijawab dengan mengubah kode dan deploy ulang — persis
keluhan yang melahirkan dokumen induk.

---

## 2. Yang SUDAH ada dan tidak dibuat ulang

Ini yang membuat modul kedua jauh lebih murah dari yang pertama:

- Tabel `menu_role_access` + `menu_user_access` — **generik**, berkolom `app_key`.
  **Tidak ada migration baru.**
- `lib/data/menu-access.ts` — baca/tulis + cache 15 detik + kunci optimistik (sidik jari → 409).
- `lib/data/locks.ts` — mekanisme kunci (`acquireBludLock`; nama tabelnya `blud_locks`,
  bentuknya umum).
- Tab **AKSES MENU** di Admin Panel + modal perkecualian per-orang — sudah berbasis registry.
- `lib/registry/menu-apps.ts` — menambah modul = **menambah satu baris**.

Yang harus dibuat baru cuma tabel peran PK-nya sendiri, plus pagar di 13 berkas route.

---

## 3. Inventaris 7 menu

Sumber: `pk-shell.tsx:23-31` (`TILES`).

| key menu | Label di ribbon | Halaman | Baca-saja? |
|---|---|---|---|
| `perjanjian_kinerja.beranda`    | Beranda        | `/perjanjian-kinerja`            | **ya** — tidak punya jalur tulis |
| `perjanjian_kinerja.sasaran`    | Master Sasaran | `/perjanjian-kinerja/sasaran`    | tidak |
| `perjanjian_kinerja.program`    | Master Program | `/perjanjian-kinerja/program`    | tidak |
| `perjanjian_kinerja.form`       | Form PK        | `/perjanjian-kinerja/form`       | tidak |
| `perjanjian_kinerja.riwayat`    | Riwayat        | `/perjanjian-kinerja/riwayat`    | tidak — ada hapus dokumen |
| `perjanjian_kinerja.pejabat`    | Master Pejabat | `/perjanjian-kinerja/pejabat`    | tidak |
| `perjanjian_kinerja.unit_kerja` | Master Unit    | `/perjanjian-kinerja/unit-kerja` | tidak |

**Kenapa `app_key` panjang, bukan `pk`.** Ia harus sama persis dengan key `app_access`
yang sudah dipakai (`PK_APP_KEY = 'perjanjian_kinerja'`). Kalau berbeda, pembersihan
baris yatim saat grant modul dicabut tidak akan menemukan barisnya — dan izin per-menu
akan hidup terus untuk orang yang aksesnya sudah dicabut.

---

## 4. Aturan bawaan — DITURUNKAN dari perilaku hari ini, bukan dikarang

Aturan besi yang sama seperti BLUD: **dengan kedua tabel kosong, perilakunya harus persis
seperti sebelum perubahan.** Tabel kosong bukan keadaan langka — itu keadaan di hari
pertama, dan bisa jadi selamanya kalau tidak ada yang membukanya.

Turunannya dari `PK_ALLOWED_ROLES` + `PK_EDIT_ROLES`:

| Peran | Bawaan | Penyimpangan |
|---|---|---|
| `SUPER_ADMIN` | EDIT | — |
| `ADMIN` | EDIT | — |
| `ADMIN_KASUBAG` | EDIT | `pejabat` → LIHAT (lantai PII, §5.1) |
| `RENBANG` | EDIT | `pejabat` → LIHAT |
| `PROGRAM` | EDIT | `pejabat` → LIHAT |
| `ADMIN_KABAG` | **LIHAT** | — (sengaja peninjau baca-saja, keputusan Sprint 0) |
| peran lain **+ grant** `perjanjian_kinerja` | lihat §5.2 — **ada yang perlu diputuskan** |

Bentuk berkasnya meniru `lib/blud/peran.ts`: hanya penyimpangan dari `bawaan` yang
ditulis, supaya barisnya pendek dan niatnya kelihatan.

---

## 5. Dua hal yang ketahuan saat memetakan — dilaporkan, belum diperbaiki

### 5.1 DUA menu punya lantai keras yang melewati seluruh lapisan izin

> Ditulis pertama kali hanya menyebut Master Pejabat. **Master Unit ketahuan menyusul**,
> saat memetakan route satu per satu — bukti kecil bahwa memetakan itu ada gunanya.

Empat tempat mengecek `session.role` **langsung**, tidak lewat `hasAppAccess` maupun
tabel peran:

| Berkas | Menu | Alasannya |
|---|---|---|
| `pejabat/route.ts:76`, `pejabat/import/route.ts:35` | `pejabat` | memuat nama, NIP, jabatan orang (PII) |
| `units/route.ts:63` | `unit-kerja` | ganti nama unit meng-*cascade* ke `pk_pejabat` + pemetaan BLUD |
| `pejabat/page.tsx:17`, `unit-kerja/page.tsx:15` | keduanya | `redirect` sebelum apa pun dirender |

Ini bukan bug — keputusan sadar, dan dipertahankan. Yang jadi masalah kalau tabel
per-menu dipasang tanpa menyadarinya: matriks Admin Panel akan menawarkan saklar "boleh
ubah" untuk `pejabat` pada peran RENBANG, admin memutarnya, layar menampilkan tombol
Simpan — lalu route membalas 403. Persis bentuk **L69**: pagar di API tapi tidak di layar.

**Yang dikerjakan** — dua hal terpisah, karena pertanyaannya memang dua:

1. **Membuka layarnya** diatur `MENU_TERTUTUP_BAWAAN` di `lib/pk/peran.ts`: bawaannya
   `TIDAK` untuk semua peran selain SUPER_ADMIN/ADMIN — persis perilaku `redirect` hari
   ini. Bedanya, sekarang admin **bisa** membukanya untuk satu orang lewat Admin Panel,
   tanpa developer. Itu memang gunanya modul ini.
2. **Mengubah isinya** dijaga `LANTAI_EDIT` — tidak bisa ditembus matriks sama sekali.
   Dipasang sebagai **DAN** di route (`bolehEditMenu` **dan** peran ∈ lantai), dan sel
   EDIT-nya dimatikan di matriks lewat `editHanyaPeran` di registry, plus baris
   "sudah ditetapkan dari awal" di panel. Saklar yang tidak melakukan apa-apa lebih
   buruk daripada saklar yang tidak ada.

Efek sampingan yang menyenangkan: ribbon berhenti menampilkan dua tile yang selama ini
selalu memantulkan RENBANG/PROGRAM/KASUBAG/KABAG balik ke Beranda.

### 5.2 Grant `app_access` menembus batas peran yang sengaja dibuat baca-saja — ✅ DIPERBAIKI

> Awalnya sengaja **ditunda** (opsi (a) di bawah). Diputuskan dikerjakan beberapa jam
> kemudian, saat muncul kebutuhan menampilkan semua peran di matriks Admin Panel:
> daftar itu baru masuk akal kalau peran yang belum diatur tampil **dengan kotak
> kosong**, dan di PK ia justru tampil tercentang penuh. Dua hal itu ternyata satu
> keputusan yang sama, jadi diambil sekalian.
>
> **Yang berubah:** `BAWAAN_TAK_TERDAFTAR` di `lib/pk/peran.ts` dari `EDIT` jadi
> `LIHAT` — sama dengan BLUD. Peran ber-grant PK yang belum diatur turun dari
> bisa-mengubah jadi lihat-saja; wewenangnya dikembalikan dengan mencentang menunya di
> matriks, per peran atau per orang. Bedanya sekarang itu keputusan yang diambil
> seseorang, bukan akibat samping dari pemberian grant.
>
> Diuji: `test-menu-access.mjs` **49/49**, termasuk pemeriksaan bahwa peran tak
> terdaftar kini tidak lebih besar dari `ADMIN_KABAG` dan bahwa bawaan PK & BLUD sudah
> sama. Duduk perkaranya di bawah, dibiarkan utuh sebagai catatan.

`isPkEditRole` (`pk-schemas.ts:68-73`) berjalan begini:

1. peran ada di `PK_EDIT_ROLES` → boleh ubah
2. peran ada di `PK_ALLOWED_ROLES` → **tidak** boleh ubah (ini yang menahan `ADMIN_KABAG`)
3. selain itu, kalau `app_access` memuat `perjanjian_kinerja` → **boleh ubah**

Jadi peran sub-bidang sembarang yang diberi grant PK mendapat wewenang **lebih besar**
daripada `ADMIN_KABAG` yang sengaja dibuat peninjau. Grant yang dimaksudkan sebagai "beri
dia akses" ternyata berarti "beri dia akses penuh".

Ini temuan lama yang baru kelihatan sekarang, bukan akibat pekerjaan ini. **Belum
diperbaiki** — dan pilihannya perlu diputuskan lebih dulu karena menyangkut aturan besi §4:

- **(a) Pertahankan persis** — bawaan untuk peran ber-grant = EDIT, sama seperti hari ini.
  Tabel kosong → perilaku identik, aturan besi utuh. Kelonggarannya diperbaiki terpisah
  sesudahnya. *Dipilih lebih dulu, lalu ditinggalkan — lihat kotak di atas.*
- **(b) Perbaiki sekalian** — bawaan peran ber-grant = LIHAT, naik ke EDIT lewat matriks.
  Lebih benar, tapi ini **perubahan perilaku**, dan harus disebut terang di catatan rilis,
  bukan diselundupkan sebagai "refactor". **← yang akhirnya dikerjakan.**

---

## 6. Peta route → menu → izin (13 berkas)

Prinsipnya diambil utuh dari `app/api/blud/_guard.ts`: **yang menentukan LIHAT/EDIT bukan
metode HTTP, melainkan apakah angka resminya berubah.** Unduh tetap LIHAT walau lewat POST.

| Berkas route | Menu | Aturan |
|---|---|---|
| `sasaran/route.ts` | `sasaran` | GET → LIHAT · POST → EDIT |
| `sasaran/import-renaksi/route.ts` | `sasaran` | EDIT — pratinjau ini hanya dicapai dari alur ubah, dan ia membaca data modul lain |
| `program/route.ts` | `program` | GET → LIHAT · POST → EDIT |
| `program/import-renaksi/route.ts` | `program` | EDIT (alasan sama) |
| `dokumen/route.ts` | `form` + `riwayat` + `beranda` | GET → **salah satu** LIHAT · POST → EDIT `form` |
| `dokumen/[id]/route.ts` | `form` + `riwayat` | GET → salah satu LIHAT · PUT → EDIT `form` · DELETE → EDIT `riwayat` |
| `dokumen/[id]/finalize/route.ts` | `form` | EDIT |
| `dokumen/[id]/download/route.ts` | `form` + `riwayat` | **salah satu LIHAT** — unduh bukan aksi tulis |
| `pejabat/route.ts` | `pejabat` | GET → LIHAT · POST → EDIT **dan** lantai PII (§5.1) |
| `pejabat/import/route.ts` | `pejabat` | EDIT **dan** lantai PII |
| `units/route.ts` | `unit_kerja` | GET → **jangan diikat ke satu menu** (lihat catatan) · POST → EDIT `unit_kerja` |
| `units/[nama]/atasan-suggest/route.ts` | `unit_kerja` + `pejabat` | salah satu LIHAT |
| `blud-nominal/route.ts` | `form` | LIHAT — lintas modul, lihat catatan |

**Catatan `units` GET.** Daftar unit kerja adalah isi dropdown di Form PK, Master Pejabat,
dan Riwayat — bukan cuma di layar Master Unit. Mengikat pagarnya ke menu `unit_kerja` akan
merusak tiga layar lain begitu menu itu disembunyikan. Ini pelajaran yang sudah dibayar di
BLUD (`pagu` dan `master-akun`): **guard endpoint baca menyebut menu yang MENAMPILKAN
datanya, bukan yang "memiliki"-nya.** Kalau ternyata dipakai hampir semua layar,
perlakukan seperti `bolehModulBlud` — cukup punya akses modulnya.

**Catatan `blud-nominal`.** Endpoint ini menarik angka dari BLUD untuk lampiran Form PK.
Hari ini pagarnya `isPkRole` saja — tidak menengok izin BLUD sama sekali. **Jangan diubah
di pekerjaan ini.** Menambahkan syarat izin BLUD terdengar lebih ketat, tapi ia mengubah
siapa yang bisa menyusun PK, dan itu keputusan proses kerja, bukan keputusan teknis.
Dicatat di sini supaya tidak terlihat seperti kelalaian.

**Sudah diverifikasi saat eksekusi** — dan dua kaitan yang tadinya cuma dugaan ternyata
nyata, keduanya justru yang paling gampang merusak layar orang lain:

- `units` GET dipanggil `form-client.tsx:76` dan `pejabat-client.tsx:46`, bukan cuma
  layar Master Unit. Dipagari `bolehModulPk`.
- `pejabat` GET dipanggil `form-client.tsx:168,197` untuk mengisi pihak pertama/kedua.
  Dipagari `bolehLihatSalahSatu(['form','pejabat'])` — kalau diikat ke menu `pejabat`
  saja, Form PK mati untuk penyusun, yang justru pekerjaan utamanya.

Satu penyimpangan dari tabel di atas: `dokumen/route.ts` GET dan `dokumen/[id]` GET
menyertakan `beranda` juga, karena ringkasan di Beranda membaca daftar dokumen.

---

## 7. Berkas yang dibuat & disentuh

**Baru:**
- `lib/pk/peran.ts` — `MENU_PK`, `LABEL_MENU_PK`, `MENU_BACA_SAJA_PK`, `TABEL`, `izinMenu`,
  `bolehEdit`, `bolehBuka`, `menuTerbuka`. **Modul daun** — tidak mengimpor apa pun,
  supaya ribbon di klien tidak ikut menyeret server ke bundel.
- `lib/pk/izin-server.ts` — penyelesai dua lapis (tabel > peran), cermin `lib/blud/izin-server.ts`.
- `app/api/perjanjian-kinerja/_guard.ts` — `bolehBukaMenu` / `bolehEditMenu` /
  `bolehLihatSalahSatu` / `bolehModulPk` / `tolakEdit`, cermin `app/api/blud/_guard.ts`.
- `app/(dashboard)/perjanjian-kinerja/_izin.ts` — sisi klien.

**Disentuh:**
- `lib/registry/menu-apps.ts` — **satu baris** entri `perjanjian_kinerja`.
- 13 berkas route di `app/api/perjanjian-kinerja/` — 37 titik guard diganti dari
  `isPkRole`/`isPkEditRole` ke pagar per-menu.
- `pk-shell.tsx` — `TILES` disaring izin hasil resolusi, bukan peran mentah.
- 7 `page.tsx` di `app/(dashboard)/perjanjian-kinerja/` — guard halaman.
- `lib/data/menu-access.ts` — komentar urutan penguncian (§10).

**Tidak disentuh:** `hasAppAccess()`, `lib/data/menu-access.ts` selain komentar,
`lib/data/locks.ts`, tabel mana pun. **Nol migration.**

---

## 8. Yang diputuskan TIDAK dikerjakan

- **Membuang `isPkRole`/`isPkEditRole`.** Keduanya tetap jadi lapis pertama ("boleh masuk
  modul?"). Lapis per-menu menjawab pertanyaan lain ("di dalam, boleh apa?"). Sama seperti
  BLUD, dua lapis, bukan satu menggantikan yang lain.
- **Sakelar mati per-sub-modul** (seperti `app_status_blud_realisasi`). PK belum punya, dan
  belum ada yang memintanya.
- **Menyatukan `lib/blud/peran.ts` dan `lib/pk/peran.ts` jadi satu helper bertipe generik.**
  Ini godaan terbesar begitu ada dua wujud. Ditahan sampai wujud kedua benar-benar jadi dan
  bisa dibandingkan — tabelnya mirip, tapi PK punya lantai PII yang BLUD tidak punya, dan
  BLUD punya `MENU_REALISASI` yang PK tidak punya. Tinjau ulang **sesudah** PK selesai,
  bukan sambil mengerjakannya.

---

## 9. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Guard route lupa dipasang di satu berkas dari 13 | Bypass lewat `curl` — pagarnya jadi dekorasi | DoD wajib: daftar 13 berkas dicentang satu per satu, dan diuji `curl`, bukan lewat layar |
| `units` GET diikat ke menu `unit_kerja` | Form PK & Master Pejabat rusak untuk yang tidak punya menu itu | §6 — pakai "salah satu" atau akses modul |
| Matriks menawarkan EDIT `pejabat` yang tidak berlaku | Admin mengira sudah memberi wewenang, penggunanya kena 403 | §5.1 — sel dimatikan + keterangan |
| Bawaan salah turun → semua terkunci saat pertama jalan | Modul PK tidak bisa dipakai siapa pun | Uji 6 peran × 7 menu = 42 sel dengan **tabel kosong**, hasilnya wajib identik dengan perilaku sekarang |
| Jangkar `data-rima` di ribbon hilang saat tile disembunyikan | Tur Rima berhenti di tengah | Periksa `lib/sentinel/tours/` yang menyebut `pk.nav-*` sebelum menyaring `TILES` |

---

## 10. Utang dari BLUD yang lunas di sini

Dokumen induk menunda satu hal ke "modul kedua" — dan ini modul kedua:

**Urutan penguncian: peran dulu, baru orang.** Tulis sebagai komentar di
`lib/data/menu-access.ts` dekat `kunciPeran`/`kunciOrang`. Aturannya belum berlaku hari ini
(tiap penyimpanan mengambil tepat satu kunci), tapi ia berlaku begitu ada satu transaksi
yang menyentuh `menu_role_access` **dan** `menu_user_access` sekaligus. Urutan `role` dulu
baru `user` searah dengan pewarisan izin, dan kebetulan juga urutan key menaik — yang
membuat lingkaran tunggu mustahil (dibuktikan T8a/T8b di `scripts/concurrency-test.js`).

---

## 11. Fase eksekusi & DoD

| # | Langkah | Selesai kalau |
|---|---|---|
| 1 | `lib/pk/peran.ts` + entri registry | `tsc` bersih; tab AKSES MENU menampilkan 7 menu PK tanpa kode Admin Panel diubah |
| 2 | `_guard.ts` + `izin-server.ts` | Ada, belum dipakai; uji unit izin 42 sel lulus |
| 3 | 13 route dipasangi pagar | Tiap berkas dicentang; `curl` ke endpoint tulis dari peran LIHAT balas 403, dari peran EDIT lolos |
| 4 | Ribbon + 7 halaman | Menu `TIDAK` hilang dari ribbon **dan** halamannya menolak kalau URL-nya diketik langsung |
| 5 | Matriks `pejabat` (§5.1) | Sel EDIT mati + keterangan; tidak ada saklar yang tidak berefek |
| 6 | Komentar urutan kunci (§10) | Tertulis |
| 7 | Uji langsung di peramban | Sebagai SUPER_ADMIN **dan** satu akun uji yang dibatasi — bukan cuma layar admin, tapi pengalaman orang yang dibatasi |

**DoD keseluruhan:** `npx tsc --noEmit` + ESLint bersih · 42 sel dengan tabel kosong
berperilaku identik dengan hari ini · endpoint tulis menolak `curl` dari peran LIHAT ·
tidak ada saklar di matriks yang tidak berefek.

---

## 12. Hasil eksekusi (2026-08-03)

Ketujuh langkah §11 selesai. **Nol migration, nol tabel baru** — sesuai dugaan §2.

### Yang berubah dari rencana

1. **Master Unit ikut berlantai.** Rencana awal cuma menyebut Master Pejabat; `units`
   ternyata punya cek peran yang sama (§5.1). Modelnya karena itu digeneralisasi jadi
   `LANTAI_EDIT` per-menu, bukan konstanta khusus PII.
2. **Endpoint & panel Admin ikut dilebarkan.** Tidak masuk rencana karena tidak
   terlihat sampai dicoba: `app/api/admin/menu-access/route.ts` masih menolak semua
   `appKey` selain `blud` (400), dan `MenuAccessPanel.tsx` memakai `const APP_KEY = 'blud'`.
   Keduanya sekarang jalan dari registry, plus pemilih modul di panel. Konsekuensinya
   modul ketiga benar-benar cuma butuh satu entri registry — klaim yang sebelumnya
   belum pernah diuji.

### Tiga perubahan perilaku yang disengaja — bukan efek samping

- **Ribbon & kartu Beranda menyusut** untuk peran non-admin: Master Pejabat & Master
  Unit hilang. Sebelumnya tampil lalu memantul balik. Tidak ada wewenang yang berpindah.
- **`sasaran/import-renaksi` naik dari `isPkRole` ke EDIT.** ADMIN_KABAG kehilangan
  akses pratinjau yang toh tidak pernah bisa ia simpan (POST-nya butuh EDIT). Padanan
  `program/import-renaksi` memang sudah EDIT sejak awal — ini menyamakannya.
- **Tampilan admin Master Unit (`?include_inactive=true`)** kini dijaga izin menu, bukan
  cek peran. Dengan tabel kosong hasilnya sama; bedanya kini bisa dibuka per-orang.

### Diverifikasi langsung, bukan disimpulkan

`npx tsc --noEmit` bersih · ESLint bersih · `test-menu-access.mjs` **46/46** (42 sel PK +
lantai + ribbon) · `bench-menu-access.mjs` lulus · `test-blud-n1-n4` 24/24 ·
`test-blud-killswitch` 17 · `test-blud-izin-periode` 28 — modul pertama tidak tergores.

Di peramban, sebagai `uji.program` (PROGRAM, tabel izin **kosong**): 5 tile · `/pejabat`
memantul ke Beranda · `GET pejabat` **200** (Form PK utuh) · `POST pejabat` **403
LANTAI_PERAN** · `GET units` 200 tapi `?include_inactive` **403** · `POST units` 403 ·
`POST sasaran` **400 Zod** (artinya pagarnya lolos).

Lalu dengan satu perkecualian `perjanjian_kinerja.pejabat = LIHAT` untuk orang itu saja:
tile jadi **6**, `/pejabat` terbuka, `GET` 200, `POST` tetap **403** — lantai tidak bisa
ditembus matriks. Percobaan menyimpan `EDIT` untuk menu berlantai ditolak **400** dengan
pesan yang menjelaskan, dan `blud.dpa` yang dikirim dengan `appKey=perjanjian_kinerja`
ditolak **400** (L68). Baris uji dibersihkan; kedua tabel kembali kosong.

### Utang yang lunas

Komentar **urutan penguncian peran-dulu-baru-orang** sudah ditulis di
`lib/data/menu-access.ts` dekat `kunciPeran`/`kunciOrang` — yang ditunda dari BLUD ke
"modul kedua".

### Putaran kedua, sore hari yang sama

Dua hal menyusul dari pemakaian nyata, bukan dari rencana:

1. **Modal Akses Menu tidak bisa digulung sampai bawah.** `.modal-box` di
   `admin-client.tsx:221` tidak punya `max-height`, jadi kotaknya tumbuh melewati tinggi
   layar; penggulung yang terlihat di kanan itu penggulung **halaman di belakangnya**,
   yang tidak menggerakkan isi modal — tombol Simpan tak pernah terjangkau. Diperbaiki
   dengan `max-height: calc(100vh - 48px)` + `overflow-y: auto` di kelas bersamanya,
   jadi **semua modal Admin Panel** ikut aman. Diverifikasi: kotak berhenti di 645px,
   isinya 860px, digulung sendiri, Simpan terjangkau.
2. **Pemilih peran hanya memuat `peranUtama`.** Itu memotong terlalu banyak — peran yang
   tidak biasa memakai sebuah modul tetap kadang perlu diatur, dan menutup pilihannya
   berarti kembali meminta developer, persis keluhan yang melahirkan modul ini. Sekarang
   **semua peran muncul**, dikelompokkan: "Biasa dipakai di modul ini" (dari
   `peranUtama`) lalu "Peran lain". `peranUtama` berubah arti — dari daftar siapa yang
   boleh diatur, jadi sekadar urutan baca. SUPER_ADMIN tetap tidak pernah muncul.

   Menampilkannya aman karena baris peran tidak memberi akses apa pun: pintu modul tetap
   `app_access` (tombol ATUR). Ini yang menuntut §5.2 ikut dibereskan — daftar panjang
   baru berguna kalau peran yang belum diatur tampil dengan kotak kosong.

Diverifikasi di peramban: PK menampilkan **26 pilihan** (5 + 21), memilih `AKUNTANSI`
memberi ketujuh menu **tanpa centang** dengan pratinjau "Bisa ubah: —", dan menyimpan
aturan untuk peran dari grup "Peran lain" berhasil 200 lalu dikembalikan bersih.

### Putaran ketiga — tombol tulis disembunyikan

Menyusul §5.2: begitu bawaan turun ke `LIHAT`, jumlah orang yang melihat tombol Simpan
lalu kena 403 bertambah banyak. Enam layar PK karena itu ikut dirapikan.

- `izinLayarPk` sudah mengembalikan `bolehUbah` (sudah memperhitungkan `LANTAI_EDIT`);
  keenam halaman kini meneruskannya ke kliennya.
- Tombol yang **mengubah** disembunyikan, bukan di-*disable*: Import, Tambah Baris,
  Hapus, Simpan, Finalisasi, dan ikon hapus per-baris di Riwayat. Tombol yang **tidak**
  mengubah tetap ada — Muat Ulang, Preview, Unduh Word — karena mengunduh bukan menulis.
- Petunjuk "…lalu klik Simpan" di kaki Master Sasaran/Program/Pejabat ikut disembunyikan.
  Menyuruh orang menekan tombol yang sengaja tidak ada membuat layar terasa rusak,
  bukan terbatas.
- Spanduk `mode lihat` muncul di atas tabel. Bentuknya dipindah ke
  `components/ui/SpandukLihat.tsx` (dari `components/blud/`), dengan pembungkus per-modul
  di `components/blud/` dan `components/pk/` supaya sepuluh pemanggil BLUD tidak berubah
  dan tiap modul tetap memakai `LABEL_MENU`-nya sendiri. Kelas CSS `.blud-spanduk-lihat`
  sengaja tidak diganti nama — nol perubahan tampilan, nol berkas tambahan tersentuh.

Diverifikasi dengan perkecualian `sasaran/form/riwayat = LIHAT` untuk `uji.program`:
spanduk muncul, daftar tombol tulis kosong di ketiga layar, ikon hapus Riwayat hilang.
Sesudah perkecualian dihapus, ketiga tombol kembali — jadi yang menyembunyikan memang
izinnya, bukan kondisi yang kebetulan selalu benar.

### Dua perbaikan tampilan Admin Panel

Keduanya bawaan lama yang baru kelihatan karena modal Akses Menu isinya paling panjang:

1. **Modal tidak bisa digulung sampai bawah** — `.modal-box` tanpa `max-height` tumbuh
   melewati tinggi layar, dan penggulung yang terlihat di kanan adalah penggulung
   halaman di belakangnya. Diperbaiki dengan `max-height: calc(100vh - 48px)` +
   `overflow-y: auto`.
2. **Bagian atas modal tertutup bilah nav** — `.ap-content` punya `z-index:1`, yang
   membentuk *stacking context*; modal hidup di dalamnya, jadi `z-index:500` pada
   `.modal-bg` hanya berlaku di antara sesama isi `.ap-content` dan seluruh modal
   terkubur di bawah `.ap-header` (100). `z-index` dibuang dari `.ap-content`
   (`position:relative` tetap). Kedua perbaikan kena ke **semua** modal Admin Panel.

### Putaran 4 — tema terang panel Akses Menu (2026-08-04)

Baris menu yang tercentang memakai teks `#e0f7ff` di atas latar putih: rasio kontras
terukur **1,1:1** — praktis tak terbaca. Sebabnya bukan warna yang salah pilih, tapi
panel ini digambar dengan *style* inline sementara seluruh aturan tema terang Admin
Panel menyasar kelas; style inline hanya kalah oleh `!important`, dan tidak ada kelas
yang bisa disasar.

Perbaikannya lewat **variabel CSS**, bukan menambah `!important` atau memindahkan
semua ke kelas: `.ap-body,.modal-bg` mendeklarasikan `--ma-fg/--ma-dim/--ma-aksen/
--ma-ok/--ma-warn/--ma-beda` + latar & garis, dan `[data-theme="light"]` menimpa
nilainya. Style inline cukup membaca `var(...)`. `.modal-bg` ikut disebut supaya modal
tetap dapat nilainya kalau suatu saat dipindah ke portal di luar `.ap-body`.

Hasil terukur: baris tercentang **1,1 → 16,15:1**, baris tak tercentang **4,5:1** (lolos
AA). Tema gelap tidak berubah — nilai variabelnya persis warna lama. Satu-satunya
selisih: latar baris tak tercentang `.02 → .03` dan garisnya `.1 → .12`, karena dua
pasang nilai yang nyaris sama digabung jadi satu variabel.

`RimaFeedbackPanel.tsx` kena cacat yang sama (16 warna hardcoded: `#7fb8d0`, `#dceefa`,
`#8fb3c8`, dst.) dan ikut diperbaiki dengan variabel yang sama. Dua warna sengaja
**tidak** dijadikan variabel: `#E24B4A` (kotak error) dan `#1D9E75` (tombol Label) —
keduanya token design system yang memang sama di terang & gelap, teksnya putih/merah
penuh, bukan warna yang menyesuaikan tema.

Yang belum terbukti dengan mata: badan tabel Rima Feedback tidak sempat dilihat karena
antrian labelnya kosong di dev. Yang diverifikasi adalah nilai variabelnya diselesaikan
benar di dalam `.ap-content` — subpohon tempat tabel itu digambar.
