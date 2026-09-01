# CONCEPT — Dua panel Beranda BLUD jadi bergerak

> Status: **selesai** (2026-09-01). Yang berubah saat dikerjakan → §10.
> Lanjutan langsung dari [CONCEPT-blud-beranda-serapan.md](CONCEPT-blud-beranda-serapan.md):
> baris kartunya sudah bicara serapan, tapi dua panel di bawahnya masih daftar
> versi. Nol kolom, nol tabel, nol migrasi, nol endpoint baru.

---

## 1. Yang diminta

Dua panel riwayat di Beranda diganti **isinya** — bukan dihapus, bukan ditambah
panel baru:

| Panel | Sekarang | Jadi |
|---|---|---|
| Riwayat Pergeseran | 5 versi · "558 baris · +Rp 0" | **rekening yang digeser**, naik/turun, per versi |
| Riwayat DPA BLUD | 5 versi · total pagu | **rekening yang baru dicatat realisasinya** |

Plus tombol segarkan manual + penyegar otomatis, karena Beranda hari ini diam
begitu halamannya sudah terbuka (§5).

## 2. Panel Pergeseran — kolomnya memang tidak pernah berguna

Pergeseran **wajib berimbang**: yang ditambah harus sama dengan yang dikurangi.
Jadi Δ Net-nya selamanya nol. Panel itu hari ini menampilkan tiga baris, tiga
kali `+Rp 0`. Angkanya benar dan tidak pernah memberi tahu apa pun.

Yang orang cari justru **rekening mana yang digeser** — itu pertanyaan yang
melahirkan seluruh fitur Tutup Pergeseran (*"sehingga secara historis tahu kemarin
aku pindah apa aja"*).

### 2.1 Jangan diambil dari "versi terbaru"

Data 2026 yang sebenarnya:

| Versi | Baris | Baris ber-selisih | Rekening yang benar-benar bergeser |
|---|---|---|---|
| 31 Jan 2026 | 558 | 4 | **2** (1 naik, 1 turun) — Rp 5 juta |
| 28 Feb 2026 | 558 | 0 | 0 |
| 29 Agu 2026 | 558 | 0 | 0 |

Dua kolom terakhir berbeda, dan itu seluruh isi §2.2: dua dari empat baris
ber-selisih adalah **induk** dari dua yang lain.

Panel yang menampilkan "rekening bergeser di versi terbaru" akan **kosong**, dan
terlihat seperti rusak.

Padahal keadaannya benar: 31 Jan sudah **ditutup** dengan basis 28 Feb
(`blud_pergeseran_tutup`), dan menutup itu menyalin kolom P ke kolom kiri —
sehingga putaran berikutnya memang mulai dari selisih nol (L82). Riwayat
pergeserannya tidak hilang, ia tinggal di versi tempat ia terjadi.

Karena itu panelnya **tetap berkelompok per versi**. Yang diganti isi tiap
kelompok, bukan pengelompokannya:

Bentuk jadinya, disalin dari layar yang sudah berjalan:

```
31 Jan 2026 · Pergeseran ke-1 · ditutup 28 Feb 2026
  Belanja Pembulatan gaji PPPK
  5.1.01.99.99.9999.01.08.0002              + Rp 5.000.000
  Belanja iuran Jaminan kesehatan PPPK
  5.1.01.99.99.9999.01.09.0002              − Rp 5.000.000

28 Feb 2026 · basis dari 31 Jan 2026
  belum ada rekening yang digeser

29 Agu 2026 · 558 baris
  belum ada rekening yang digeser
```

Tanggal versinya tetap tampil, jadi riwayat versinya tidak hilang — ia cuma
berhenti jadi satu-satunya isi.

### 2.2 SUDAH DIBUKTIKAN: ya, digulung — panelnya menyaring daun

Pertanyaannya "apakah `bertambah_berkurang` ikut digulung ke induk?", dan dugaan
saya di draf ini **SALAH**. Saya menulis bahwa 4 baris tak-nol pada 558 "tampak
seperti hanya baris yang benar-benar bergeser". Ternyata tidak.

Dua bukti, dan keduanya diperiksa sebelum kode ditulis:

- **Kode**: `recalcPergeseranJumlah` ([recalc.ts:135](../lib/blud/recalc.ts:135))
  menulis `bertambah_berkurang = pergeseran − jumlah` untuk **setiap** baris,
  termasuk agregat — dan `pergeseran`/`jumlah` sebuah agregat adalah jumlah
  anaknya. Jadi selisih induk **adalah** selisih anaknya.
- **Data 2026**: dari 4 baris ber-selisih, **2 punya anak**. Rekening
  `…01.08` (+Rp 5 juta) itu induk dari `…01.08.0002` (+Rp 5 juta) — satu
  pergeseran, dihitung dua kali.

Jadi panelnya menyaring **daun** (`NOT EXISTS` anak). Terlihat langsung di layar:
versi 31 Jan menampilkan **2** rekening (+5jt / −5jt), bukan 4.

Bedanya dengan `saringYangBergeser` di `cetak-data.ts` — yang justru **membawa**
leluhur — bukan ketidakkonsistenan: di sana hasilnya dokumen anggaran yang tidak
terbaca tanpa baris induk; di sini hasilnya daftar rekening, dan induk cuma
menggandakan isinya.

### 2.3 Penomoran putaran

"Pergeseran ke-n" **dihitung dari urutan**, tidak disimpan (L82) — nomor putaran
sengaja tidak punya kolom. Penanda "ditutup" dibaca dari `blud_pergeseran_tutup`.

Batasi 4–5 rekening per versi + "lihat N lainnya"; satu versi bisa saja menggeser
puluhan rekening dan panel Beranda bukan tempat menggulir.

## 3. Panel Realisasi — umpan yang bergerak, bukan peringkat yang diam

Usulan pertama saya "5 serapan terbesar" **ditolak, dan benar ditolak**: daftar
terbesar hampir tidak pernah berubah. Dibuka besok isinya sama, jadi tidak ada
alasan menengok Beranda lagi. Yang diminta kebalikannya — begitu sebuah rekening
dicatat realisasinya, ia muncul paling atas.

Bentuknya jadi cermin panel di sebelahnya: yang satu "5 versi terbaru", yang ini
**"5 rekening terakhir yang dicatat"**.

### 3.1 Jam mana yang dipakai — ini yang paling gampang salah

Ada dua tanggal di `blud_realisasi_tx`, dan keduanya masuk akal:

| Patokan | Artinya | Akibatnya di panel ini |
|---|---|---|
| `tanggal` | tanggal kejadian belanjanya | mencatat belanja Maret hari ini → muncul di urutan Maret, tenggelam. **Tidak terlihat bergerak.** |
| `updated_at` | kapan barisnya diketik | mencatat belanja Maret hari ini → naik ke paling atas ✔ |

Yang dipakai `updated_at`. Kolomnya `DEFAULT CURRENT_TIMESTAMP ON UPDATE
CURRENT_TIMESTAMP`, jadi **satu kolom menjawab dua hal**: saat baris lahir ia sama
dengan waktu dibuat, dan saat barisnya dikoreksi ia ikut naik. Transaksi yang
diperbaiki juga naik ke atas, dan itu memang wajar — ia baru saja bergerak.

Tidak perlu `GREATEST(created_at, updated_at)`: hasilnya sama, dan dua kolom untuk
satu pertanyaan cuma mengundang salah satu dilupakan nanti.

### 3.2 Per rekening, bukan per transaksi

Yang diminta "rekening". Jadi dikelompokkan per `anggaran_key` dengan
`MAX(t.updated_at)` sebagai urutannya — satu rekening yang menerima lima transaksi
muncul sekali, bukan lima kali.

### 3.3 Angka kanannya total setahun + persen, bukan nominal transaksi terakhir

```
Realisasi Terbaru                        12 rekening dicatat hari ini

5.1.02.99.99.9999.02.01.0003
Belanja ATK · 3 transaksi · 14:32           Rp 12.500.000  ·   8%

5.2.02.99…
Rak lemari gelas pasien · 1 transaksi · 14:05   Rp 1.425.000  ·  95%
```

Persennya diwarnai memakai **aturan yang sama persis** dengan tabel Realisasi —
merah kalau menembus, amber kalau mepet (`mepetSetahun`, `EPS_PRATINJAU`,
`AMBANG_MEPET` yang sudah ada). Ini yang membuat panel ini lebih dari catatan:
begitu Anda mencatat sesuatu, langsung terlihat rekening itu sekarang di 95% —
peringatannya datang **saat mengetik**, bukan nanti waktu membuka layar Realisasi.

Kalau angkanya nominal transaksi terakhir, panelnya cuma jadi log.

### 3.4 Waktunya jam, bukan "2 jam lalu"

Halaman ini bisa dibiarkan terbuka. "Tadi" yang dirender sejam lalu berubah jadi
salah dengan sendirinya, dan tidak ada yang memperbaikinya. Jadi: **jam** untuk
yang hari ini (`14:32`), **tanggal** untuk yang lebih lama (`28 Agu`). Sekalian
sepadan dengan stempel "diperbarui" di §5.

### 3.5 Baris kepala menyebut jumlahnya

"12 rekening dicatat hari ini". Kalau pagi itu orang mengetik 40 transaksi, panel
yang cuma memuat 5 baris menyembunyikan bahwa ada 40. Jumlahnya disebut, isinya 5
teratas.

### 3.6 Rekening yatim tetap ditampilkan, diberi tanda

Alokasi yang `anggaran_key`-nya sudah **lenyap** dari versi pagu berjalan tidak
punya pagu untuk dibagi, jadi persennya tidak bisa dihitung. Menyembunyikannya
salah: uangnya nyata dan sudah keluar, dan justru itu yang paling perlu dilihat —
layar Realisasi sudah punya spanduk *"rekening hilang — periksa realisasinya"*.

Jadi tetap tampil, nominalnya tetap, persennya `—` dengan keterangan "rekening
tidak ada di versi pagu". Ini konsekuensi langsung §9.1 konsep serapan.

### 3.7 Datanya kosong sekarang

`blud_realisasi_alokasi` **nol baris di semua tahun**. Panel ini akan berbunyi
"Belum ada transaksi dicatat" sampai Buku Kas mulai dipakai. Bukan alasan menunda,
tapi harus diverifikasi dengan data uji yang dimasukkan lalu dihapus lagi — persis
cara kartu serapan kemarin dibuktikan.

## 4. Pagar — sama seperti kartu, tanpa pengecualian

| Panel | Izin | Sakelar |
|---|---|---|
| Rekening yang digeser | `peta['pergeseran']` | — |
| Realisasi Terbaru | `peta['realisasi']` | `app_status_blud_realisasi` |

Panel realisasi memajang uang yang sudah keluar, sama seperti kartu di atasnya.
Kalau pagarnya lupa, lubang yang baru ditutup kemarin terbuka lagi lewat panel —
dan `npm run check:killswitch` **tidak akan melihatnya**, karena ia memindai
`app/api/*` sedangkan Beranda bertanya ke database langsung (§8.2 konsep serapan).

Datanya **tidak dihitung** kalau tidak berhak, bukan dihitung lalu disembunyikan:
menghitungnya tetap mengirim angkanya ke peramban.

## 5. Segarkan — tombol, stempel, dan otomatis bersyarat

### 5.1 Sejauh mana Beranda sudah "live"

Beranda itu server component `force-dynamic` — dia menghitung ulang **tiap kali
dibuka**. Jadi: simpan di Buku Kas → pindah ke Beranda → sudah terbaru.

Yang belum: Beranda yang **sudah terbuka** tidak menengok lagi. Penyegar 30 detik
yang ada cuma di layar Realisasi.

### 5.2 Tombol + stempel

`router.refresh()`, bukan `location.reload()` — halaman dihitung ulang di server
lalu isinya ditukar, posisi gulir tetap, tidak berkedip. `useRouter` sudah dipakai
di berkas itu untuk pemilih tahun.

**Stempel "diperbarui 14:32" wajib ikut**, dan menurut saya lebih penting daripada
tombolnya: dasbor yang tidak menyegarkan diri sendiri tapi tidak menyebutkan
umurnya itu diam-diam berbohong — orang tidak bisa membedakan angka 5 detik lalu
dari 5 jam lalu. Dengan jamnya, tombol itu punya arti.

### 5.3 Otomatis 3 menit, dengan DUA syarat

Jalan hanya kalau **tab terlihat** DAN **ada aktivitas nyata dalam 15 menit
terakhir**.

Syarat pertama alasannya jelas: tab yang ditinggal ke Excel selama tiga jam akan
menghitung ulang 60 kali tanpa pernah dilihat siapa pun.

Syarat kedua alasannya **ditemukan saat memeriksa sesi**, dan bukan soal beban:

- Idle timeout 60 menit (`SESSION_INACTIVE_MINUTES`, [constants.ts:172](../lib/constants.ts:172)).
- Ping keepalive jalan **tiap 10 menit** ([SessionKeepAlive.tsx:16](../components/guards/SessionKeepAlive.tsx:16)),
  jadi cap `lastActive` di server bisa tertinggal sampai 10 menit di belakang
  hitungan klien.
- Akibatnya sesi di **server** mati sekitar menit ke-52, sementara hitung mundur
  di layar baru jatuh di menit ke-60.

Selama ini celah 8 menit itu tak terlihat — tak ada yang bicara ke server di
rentang itu. Dengan penyegar otomatis, tembakan di menit ke-54 dijawab "sesi
habis" lalu dilempar ke halaman login: orangnya melihat modal *"Sesi akan habis,
04:12"* lalu tiba-tiba sudah di layar login. Bukan lubang keamanan — arahnya
justru lebih ketat — tapi membingungkan, dan modal peringatan yang sengaja dibuat
itu jadi sia-sia.

Syarat "aktif dalam 15 menit" membuat penyegar **tidak pernah** menembak di
jendela peringatan menit 55–60.

### 5.4 Auto-refresh TIDAK memperpanjang sesi

Diperiksa, dan ini yang paling penting dipastikan sebelum memasang penyegar
otomatis di halaman yang biasa ditinggal terbuka:

`lastActive` hanya diperbarui oleh satu pintu — `/api/auth/keepalive` — dan pintu
itu hanya diketuk kalau ada **gerakan sungguhan** (mouse, ketikan, gulir, sentuh).
`router.refresh()` tidak menerbitkan token baru dan tidak menghasilkan satu pun
event itu. Jadi tab yang ditinggal tetap logout di menit ke-60; penyegar tidak
membuatnya abadi.

Ini harus ikut diuji, bukan cuma dipercaya — kalau suatu saat ada yang menyelipkan
rotasi token ke jalur render, timeout 60 menit lenyap tanpa gejala.

### 5.5 Bebannya

Beranda sekali muat ±30 kueri. Sepuluh di antaranya perulangan riwayat kedua panel
ini ([page.tsx:110](../app/(dashboard)/blud/page.tsx:110) dan
[:125](../app/(dashboard)/blud/page.tsx:125)) — dan perulangan itu **hilang oleh
perubahan ini** (§6), jadi halamannya turun ke ±20.

Jeda 3 menit = 20 muat/jam per tab. Sepuluh orang membuka bersamaan ≈ **2 kueri
per detik**. Aman untuk MySQL di server ini, dan dua syarat §5.3 memotongnya lagi.

Alasan saya semula menahan auto-refresh adalah N+1 itu — dan pekerjaan ini yang
menghapusnya, jadi prasyaratnya terpenuhi oleh perubahan yang sama.

## 6. Kueri

| Panel | Sekarang | Jadi |
|---|---|---|
| Pergeseran | 1 + **5 kueri di dalam perulangan** | 1 agregat (`bertambah_berkurang <> 0`, dikelompokkan versi) |
| Realisasi | 1 + **5 kueri di dalam perulangan** | 1 agregat (`JOIN` tx, `GROUP BY anggaran_key`, urut `MAX(updated_at)`) |

`blud_realisasi_alokasi` tidak punya `updated_at` maupun `bulan` — keduanya milik
`blud_realisasi_tx`, jadi panel realisasi wajib `JOIN`. Pagu & persennya diambil
dari data yang **sudah dimuat** `ringkasSerapan`, bukan kueri ketiga.

## 7. Yang sengaja TIDAK dikerjakan

**"5 serapan terbesar"** — §3, daftar yang tidak pernah berubah tidak memberi
alasan untuk menengok lagi.

**Waktu relatif ("2 jam lalu")** — §3.4.

**Auto-refresh tanpa syarat** — §5.3.

**Membetulkan jeda keepalive 10 menit** yang membuat sesi server mati ~8 menit
sebelum hitung mundur di layar. Itu perilaku sesi, bukan Beranda, dan menyentuhnya
berarti menyentuh `SessionKeepAlive` yang dipakai seluruh aplikasi. Dicatat di
sini supaya tidak hilang; penyegar Beranda cukup menghindarinya.

**Daftar versi DPA di Beranda** — hilang, diganti panel realisasi. Informasinya
masih ada di dropdown versi layar DPA, jadi ia pindah, bukan lenyap.

## 8. Definition of Done

- [x] Panel Pergeseran menampilkan rekening yang digeser + nominal bertanda,
      **dikelompokkan per versi**, bukan hanya versi terbaru
- [x] Versi tanpa pergeseran berbunyi "belum ada rekening yang digeser", bukan
      kosong tanpa keterangan — diuji pada data 2026 (28 Feb & 29 Agu memang nol)
- [x] Versi yang sudah ditutup diberi tanda + nomor putaran, dihitung dari urutan
- [x] Sudah dibuktikan apakah `bertambah_berkurang` digulung ke induk; kalau ya,
      panelnya menyaring daun (§2.2)
- [x] Panel Realisasi urut `MAX(updated_at)`, **bukan** `tanggal` — diuji dengan
      transaksi bertanggal lama yang baru diketik: harus muncul paling atas
- [x] Transaksi yang **dikoreksi** ikut naik ke atas
- [x] Satu rekening dengan banyak transaksi muncul **sekali**
- [x] Angka kanannya total setahun + persen, diwarnai aturan yang sama dengan
      tabel Realisasi
- [x] Rekening yatim tetap tampil, persennya `—` dengan keterangan
- [x] Waktu ditulis jam/tanggal, tidak ada waktu relatif
- [x] Baris kepala menyebut jumlah rekening yang dicatat hari ini
- [x] Panel realisasi hilang kalau `peta['realisasi'] === 'TIDAK'` atau sakelarnya
      mati; datanya **tidak dihitung**, bukan dihitung lalu disembunyikan
- [x] Tombol segarkan memakai `router.refresh()`, posisi gulir tetap
- [x] Stempel "diperbarui HH:MM" tampil dan ikut berubah tiap penyegaran
- [x] Auto-refresh berhenti saat tab tersembunyi, dan saat tidak ada aktivitas
      15 menit
- [x] **Auto-refresh tidak memperpanjang sesi** — dibuktikan, bukan diasumsikan
      (§5.4)
- [x] Kedua panel tidak lagi memanggil database di dalam perulangan
- [x] Regresi: `scripts/test-blud-beranda-panel.mts` — uji mutasi yang wajib
      tertangkap: (a) urutan ditukar ke `tanggal`, (b) panel pergeseran hanya
      membaca versi terbaru, (c) pengelompokan per transaksi bukan per rekening,
      (d) pagar izin/sakelar panel realisasi dilepas, (e) syarat aktivitas pada
      auto-refresh dilepas, (f) rekening yatim disembunyikan

## 9. Urutan

1. **Panel Pergeseran** (§2) — paling mandiri, tidak menyentuh pagar apa pun
2. **Panel Realisasi** (§3) + pagarnya (§4) — dikerjakan bersama, kartunya tidak
   boleh pernah hidup tanpa pagarnya
3. **Tombol + stempel** (§5.2) — kecil
4. **Auto-refresh bersyarat** (§5.3–5.4) — terakhir, karena syaratnya yang paling
   perlu diuji

## 10. Yang berubah saat dikerjakan

**§2.2 terjawab, dan dugaan konsepnya salah** — selisih pergeseran memang
digulung ke induk. Sudah ditulis ulang di tempatnya.

**Stempel jamnya milik SERVER, bukan state klien.** Rancangan awal menyimpan
`Date` di `useState` lalu mengisinya di `useEffect` supaya server dan klien tidak
menghasilkan HTML berbeda. ESLint menolaknya (`setState` langsung di dalam efek),
dan penolakan itu menunjuk ke jalan yang lebih baik: `page.tsx` mengirim
`dimuatPada` dari `waktuSekarangWIB()`, dan karena `router.refresh()`
**menjalankan ulang server component-nya**, stempelnya ikut berganti sendiri —
nol state, nol efek, nol risiko hydration. Bonusnya yang sebenarnya: jamnya jadi
menyatakan *"angka ini dari jam berapa"*, bukan *"saya menekan tombolnya jam
berapa"* — dan kalau servernya lambat, keduanya memang berbeda.

Alasan yang sama membuat `tanggal_hari_ini` ikut dikirim dari server. Menghitung
"hari ini" di peramban bukan cuma masalah hydration: pada server ber-TZ UTC
menjelang tengah malam WIB, keduanya jatuh di tanggal yang berlainan.

**`kode_rekening` bisa KOSONG** — ketahuan saat dijalankan, bukan dari kode.
Baris rincian di bawah kelompok (`ANGGOTA-KELOMPOK-A`, `KETUA-KELOMPOK-B`) memang
tidak bernomor, jadi barisnya sempat berbunyi `· 1 transaksi · 12:13` dengan titik
menggantung di depan. Dua akibat: awalannya wajib bersyarat, dan
`key={r.kode_rekening}` tidak sah — diganti `versi + indeks`.

**`#85B7EB` pada rekening yatim terbaca abu-abu di tema terang, dan itu BENAR.**
`blud-shell.tsx:658` memetakan ulang `[style*="rgb(133, 183, 235)"]` → `#6B7280`
di seluruh modul, karena biru muda itu tak terbaca di atas putih. Sempat tampak
seperti gaya sebaris yang ditimpa; ternyata mekanisme modul yang sudah ada.
Dibiarkan.

**§6 — kuerinya 12 → 4, bukan 2.** Panel realisasi memang 1 kueri agregat.
Panel pergeseran 3 (daftar versi · baris bergeser · `getTutupPergeseran`) — semua
rata, tidak ada yang di dalam perulangan, dan itu yang jadi maksudnya. Ditulis di
sini supaya angkanya tidak dikutip salah nanti.

**Pagunya dimuat sekali** lewat `muatDataPagu` yang baru dipisah dari
`ringkasSerapan`. Kartu serapan dan panel realisasi berdiri di atas bahan yang
sama persis; memuatnya dua kali bukan cuma boros, tapi membuka celah dua jawaban
dari keadaan yang berbeda kalau ada yang menyimpan di selanya. Efek sampingnya:
pagar izin pindah satu langkah ke DEPAN — yang dijaga sekarang pemuatannya
sendiri, bukan pemanggilan `ringkasSerapan`. Uji regresi lama ikut disesuaikan
(dan dipastikan masih menggigit).

**§5.4 dibuktikan tiga cara**, sesuai DoD:
1. `lastActive` hanya distempel di `createToken`; pemanggilnya cuma
   `/api/auth/login` dan `/api/auth/keepalive`.
2. `proxy.ts` hanya **membaca** cookie (baris 117) dan **menghapus**-nya (130) —
   tidak pernah menerbitkan ulang. Ini yang menutup celah "setiap permintaan RSC
   lewat proxy, jangan-jangan ia memperpanjang".
3. Diamati: satu klik Segarkan menghasilkan **tepat satu** permintaan (RSC GET),
   tanpa `/api/auth/keepalive`.

**Yang diverifikasi dengan data uji sungguhan** (disisipkan lalu dihapus):
transaksi bertanggal Maret yang baru diketik naik ke puncak · transaksi yang
**dikoreksi** (`kas_keluar` diubah) melompat dari urutan terbawah ke #1 lewat
`ON UPDATE CURRENT_TIMESTAMP` · satu rekening dengan 3 transaksi muncul sekali ·
rekening yatim tampil dengan `—` · warna 105%/95%/30% dibaca balik dari
`getComputedStyle` dan cocok dengan tabel Realisasi · tombol Segarkan mengubah
stempel 12:13 → 12:14 dengan posisi gulir tetap di 86.4.

Regresi: `npx tsx scripts/test-blud-beranda-panel.mts` (50) — **7 uji mutasi
tertangkap**, satu lebih banyak dari yang direncanakan di §8: penyaring daun §2.2
ikut dijaga, karena itu justru keputusan yang dugaan awalnya keliru.
