# CONCEPT — Bertambah & Berkurang dipisah di Pergeseran

> Status: **selesai** (2026-09-01). Yang berubah saat dikerjakan → §11.
> Satu tabel, dua kolom baru. Nol perubahan pada Realisasi.

---

## 1. Yang diminta

Hari ini kolom pergeseran cuma satu — `Bertambah/Berkurang`, bertanda, hasil
hitungan `pergeseran − jumlah`. Karena ia satu angka, rekening yang **ditambah
dan dikurangi dalam dokumen yang sama** kehilangan separuh ceritanya.

Contoh nyata yang dipakai sepanjang konsep ini: 20 pergeseran, 15 rekening, 5
di antaranya bergerak dua arah.

| # | Dari → Ke | | # | Dari → Ke | | # | Dari → Ke |
|---|---|---|---|---|---|---|---|
| 1 | A → C 30jt | | 8 | D → H 20jt | | 15 | L → O 18jt |
| 2 | A → E 50jt | | 9 | D → K 25jt | | 16 | **C → I 12jt** |
| 3 | A → H 20jt | | 10 | F → C 15jt | | 17 | **E → G 15jt** |
| 4 | B → E 35jt | | 11 | F → J 25jt | | 18 | **H → N 18jt** |
| 5 | B → H 40jt | | 12 | F → G 10jt | | 19 | **J → M 10jt** |
| 6 | B → J 15jt | | 13 | L → K 22jt | | 20 | **K → O 8jt** |
| 7 | D → E 45jt | | 14 | L → J 30jt | | | |

Hasilnya di tabel:

| Rekening | Jumlah | Pergeseran | Bertambah | Berkurang | Hari ini terlihat |
|---|---|---|---|---|---|
| A Gaji ASN | 500jt | 400jt | — | 100jt | −100jt |
| B Gaji PPPK | 300jt | 210jt | — | 90jt | −90jt |
| **C ATK** | 80jt | 113jt | **45jt** | **12jt** | +33jt |
| D Obat | 600jt | 510jt | — | 90jt | −90jt |
| **E Alkes** | 400jt | 515jt | **130jt** | **15jt** | +115jt |
| F Listrik | 200jt | 150jt | — | 50jt | −50jt |
| G Air | 50jt | 75jt | 25jt | — | +25jt |
| **H Makan Pasien** | 350jt | 412jt | **80jt** | **18jt** | +62jt |
| I Cetak | 60jt | 72jt | 12jt | — | +12jt |
| **J Pemeliharaan** | 250jt | 310jt | **70jt** | **10jt** | +60jt |
| **K Perjalanan Dinas** | 120jt | 159jt | **47jt** | **8jt** | +39jt |
| L Kebersihan | 180jt | 110jt | — | 70jt | −70jt |
| M BBM | 70jt | 80jt | 10jt | — | +10jt |
| N Laundry | 90jt | 108jt | 18jt | — | +18jt |
| O Pelatihan | 110jt | 136jt | 26jt | — | +26jt |
| | **3,36 M** | **3,36 M** | **463jt** | **463jt** | **0** |

Kolom paling kanan itu keadaan sekarang. Lima baris tebal terbaca seolah cuma
kebagian; C sebenarnya menerima 45jt **dan** melepas 12jt.

Baris bawah `463jt = 463jt` adalah bonus yang tidak diminta tapi ikut lahir:
hari ini sistem hanya tahu selisihnya nol, dengan ini ia tahu geserannya
benar-benar **berpasangan**.

## 2. Aturan intinya: kosong itu normal

Seluruh rancangan berdiri di satu kalimat:

> **Kosong = "belum diuraikan, hitung dari selisih".
> Terisi = "sudah diuraikan tangan, jangan diutak-atik, cukup diperiksa."**

Satu aturan itu menjawab dua temuan yang ditemukan saat audit dampak, dan
keduanya akan merusak fitur ini kalau dilewatkan.

### 2.1 Temuan A — recalc akan menghapus angka yang diketik

`recalcPergeseranJumlah` menulis `bertambah_berkurang = pergeseran − jumlah`
**tanpa syarat** ([recalc.ts:135](../lib/blud/recalc.ts:135)), dan versi
parsialnya jalan **tiap ketikan** ([recalc.ts:227](../lib/blud/recalc.ts:227)).
Wajar — kolom itu memang hasil hitungan.

Kalau kolom baru diperlakukan sama:

```
1. C ATK diketik      Bertambah 45jt · Berkurang 12jt      ✔
2. Pemakai pindah ke baris D, membetulkan salah ketik uraian
3. Recalc jalan: "selisih C = 113 − 80 = +33"
4. C ATK jadi         Bertambah 33jt · Berkurang 0         ✘  tanpa pesan
```

Karena itu kolomnya **nullable**, dan recalc hanya mengisi yang NULL.

### 2.2 Temuan B — 50 snapshot lama akan gagal dipulihkan

`PergeseranBarisInputSchema` mewajibkan `bertambah_berkurang`
([schemas.ts:252](../lib/blud/schemas.ts:252)). Kalau kolom baru diwajibkan
juga, maka Pulihkan snapshot lama → isi form → Simpan → **ditolak 400**, sebab
baris lama tidak punya field itu. Yang rusak bukan satu simpanan melainkan
seluruh riwayat + cadangan Drive, persis saat paling dibutuhkan.

Nullable menyelesaikannya — tapi harus **disengaja**, bukan kebetulan lolos.

### 2.3 Kenapa TIDAK menyimpan nilai turunannya

Alternatif yang tampak lebih rapi: selalu isi kedua kolom (turunan untuk yang
satu arah) plus bendera `uraian_manual`. Ditolak, dan preseden repo ini yang
menolaknya — `is_latest` dibuang justru karena "dua sumber kebenaran soal angka
uang cepat atau lambat berbeda pendapat". Nilai turunan yang disimpan akan basi
begitu `vol_p` disunting tanpa recalc menyentuh kolom itu.

Yang disimpan hanya **uraian tangan**. Sisanya dihitung saat dipakai.

## 3. Bentuk kolom & invarian

```sql
ALTER TABLE pergeseran_dpa
  ADD COLUMN bertambah DECIMAL(18,2) NULL
    COMMENT 'Uraian tangan: bagian yang MASUK. NULL = belum diuraikan, turunkan dari selisih'
    AFTER bertambah_berkurang,
  ADD COLUMN berkurang DECIMAL(18,2) NULL
    COMMENT 'Uraian tangan: bagian yang KELUAR. NULL = belum diuraikan'
    AFTER bertambah;
```

Berkas: `docs/migrations/migration-pergeseran-uraian-geser.sql` + cermin di
`docs/schema-mysql.sql`. Tanpa `IF NOT EXISTS` pada `ADD COLUMN` (aturan repo).

**Satu fungsi, satu tempat** — `uraiGeser()` di `lib/blud/urai-geser.ts`, dipakai
layar, Excel, Cetak, dan panel Beranda. Empat salinan rumus yang sama adalah
cara L78 lahir:

```
uraiGeser(baris, anak):
  punya anak       → jumlahkan uraiGeser tiap anak          (rollup, §4)
  bertambah/berkurang terisi → pakai apa adanya (?? 0)
  selain itu       → { max(0, selisih), max(0, −selisih) }
```

**Invarian yang diperiksa saat Simpan**, hanya untuk baris yang diuraikan tangan:

```
bertambah − berkurang  ==  pergeseran − jumlah      (toleransi EPS, kolom DECIMAL)
bertambah >= 0  dan  berkurang >= 0
```

C: `45 − 12 = 33` cocok dengan `113 − 80`. ✔ Kalau tidak cocok → ditolak dengan
kode `URAIAN_GESER_TIDAK_COCOK` yang **menyebut nama rekeningnya**, bukan pesan
umum.

Sifat `Σ bertambah = Σ berkurang` di baris akar **tidak perlu diperiksa
terpisah** — ia mengikuti sendiri dari invarian per-baris ditambah pagar
`PERGESERAN_TIDAK_BERIMBANG` yang sudah ada. Tetap ditampilkan sebagai angka,
karena itu yang berguna dilihat orang.

## 4. Rollup ke induk — dan L85

Uraian tangan **hanya boleh di baris daun**. Baris induk angkanya selalu datang
dari anak-anaknya, persis seperti `pergeseran` sekarang. Konsekuensinya: induk
tidak pernah menyimpan uraian, ia dihitung.

Dan rollup induk **bukan** turunan dari selisihnya sendiri:

| | Bertambah | Berkurang | Selisih |
|---|---|---|---|
| Induk, dari selisihnya sendiri ✘ | 40jt | — | +40jt |
| Induk, dijumlah dari anak ✔ | 50jt | 10jt | +40jt |

Yang kedua yang benar, dan yang menghasilkan baris total `463jt / 463jt`.

**L85 berlaku penuh di sini.** Kolom baru ikut digulung, jadi layar mana pun
yang menampilkan daftar rekening — panel Beranda, `saringYangBergeser` di Cetak
— wajib menyaring daun. Kalau tidak, 45jt milik C muncul lagi di induknya,
kakeknya, dan seterusnya. Ini persis pelajaran yang baru ditemukan 2026-09-01,
dan kolom ini pintu keempatnya.

## 5. Dampak — hasil audit sebelum konsep ini ditulis

### 5.1 Aman, tidak tersentuh sama sekali

**Realisasi dan Buku Kas tidak pernah membaca `bertambah_berkurang`.** Pagu
diambil `SELECT … pergeseran AS pagu` ([data.ts:192](../lib/blud/data.ts:192),
[pagu.ts:104](../lib/blud/pagu.ts:104)). Ikut aman karena berdiri di jalur pagu
yang sama: Pratinjau Serapan, kartu serapan Beranda, `/dashboard`, Tutup Kas,
dan pagar "pagu tak boleh turun di bawah realisasi" (`pagarSimpanVersi`).

Rekap PJ juga aman — nominalnya `r.pergeseran`, bukan selisihnya.

Ini bukan kebetulan melainkan akibat rancangan: kolom ini **mencatat, tidak
menggerakkan**. `pergeseran = vol_p × harga_p` tetap satu-satunya yang
menentukan pagu, dan invarian itu tidak disentuh sama sekali — invarian yang
sama yang dipakai `pergeseranKeTahunBaruInput` dan dokumen Excel.

### 5.2 Wajib ikut berubah

L69: perbaikan belum selesai sampai semua jalur kena. Tiga teratas yang paling
gampang terlupa:

| Tempat | Yang harus dilakukan | Kalau terlewat |
|---|---|---|
| `tutupPergeseranRows` ([tutup-pergeseran.ts:67](../lib/blud/tutup-pergeseran.ts:67)) | uraian di-NULL-kan bersama `bertambah_berkurang` | sesudah Tutup, C tetap berbunyi "45/12" padahal selisihnya nol — dokumen berbohong |
| `pergeseranKeInput` ([row-map.ts:53](../lib/blud/row-map.ts:53)) | bawa kedua kolom | terbuang senyap lalu terkirim balik sebagai "tidak ada" |
| `PERGESERAN_COLUMNS` ([data.ts:853](../lib/blud/data.ts:853)) | tambah 2 kolom | tidak pernah tertulis ke DB |

Sisanya rutin:

- `recalcPergeseranJumlah` + `partialRecalcPergeseran` — jangan timpa yang
  terisi; rollup induk
- `injectDpaKePergeseran` ([recalc.ts:628](../lib/blud/recalc.ts:628)) — baris
  baru dari DPA lahir NULL
- `dpaKePergeseranInput` — NULL (baris salinan DPA, belum digeser)
- `pergeseranKeTahunBaruInput` — **tidak dibawa**, alasan yang sama dengan
  `bertambah_berkurang` sekarang: uraian geseran hanya bermakna dalam tahunnya
- `pergeseran-client.tsx` — tiga tempat baris baru (`addChild`, cabang
  `willSwitchToAggregator`, `addSibling`) + kolom & input di tabel
- `schemas.ts` — `bertambah`/`berkurang`: `z.number().min(0).max(1e15).nullable().optional()`
- `types/index.ts` — `PergeseranBaris` + `PergeseranBarisInput`

Negatif ditolak Zod: "bertambah −5jt" tidak punya arti, dan membiarkannya
membuat invarian §3 bisa dipenuhi dengan angka omong kosong.

### 5.3 Yang berubah tapi bukan kerusakan

Dokumen versi **lama** yang dicetak ulang akan keluar dengan tata letak baru
(§6). Angkanya identik dan benar; bentuknya beda dari lembar yang dulu
ditandatangani. Dicatat di sini supaya tidak jadi kejutan.

## 6. Dokumen — tiga kolom

Pilihan pemilik aplikasi: dokumen ikut bercerita, bukan cuma layar.

| Sekarang (12 kolom) | Jadi (14 kolom) |
|---|---|
| … 9 Pergeseran · **10 Bertambah/Berkurang** · 11 Level · 12 Jangkar | … 9 Pergeseran · **10 Bertambah · 11 Berkurang · 12 Selisih** · 13 Level · 14 Jangkar |

Kolom `Selisih` **tetap ada dan tetap rumus** `I{n}-F{n}` — jangan diganti nilai
mati. Itu yang membuat dokumen tetap bisa diperiksa sendiri: buka berkasnya,
ubah satu angka Pergeseran, selisihnya ikut. Dua kolom baru berisi **nilai**,
sebab uraian tangan memang bukan hasil rumus.

`F` (Jumlah) dan `I` (Pergeseran) tidak bergeser, jadi rumusnya tetap sah.
`KOLOM_PERGESERAN`, `LEBAR_PERGESERAN`, dan `kolomAngka` di `hiasBarisData` ikut
disesuaikan; `cetak-data.ts:411` idem.

Baris terakhir dokumen menampilkan total Bertambah dan total Berkurang — angka
`463jt / 463jt` yang jadi bukti geserannya berpasangan.

## 7. Data lama

Migrasi menambah kolom dalam keadaan NULL untuk **semua** baris yang sudah ada.
Karena NULL = "hitung dari selisih", tiap baris lama menampilkan persis seperti
hari ini. Nol backfill, nol perubahan angka.

Dan tidak perlu diasumsikan data lama bebas rekening dua arah: kalaupun dulu ada,
uraiannya **tidak pernah tersimpan** — yang ada cuma netnya. Migrasi ini tidak
bisa merusak apa pun karena tidak ada yang bisa dirusak. Yang tidak bisa
dilakukannya cuma satu: menghidupkan uraian lama yang tak pernah dicatat.
Uraian dua arah berlaku untuk pergeseran **sejak** fitur ini hidup.

Riwayat simpan & cadangan Drive: barisnya tanpa kedua field → nullable →
dipulihkan mulus, uraiannya tampil sebagai turunan. `BarisSchema` di
`cadangan-berkas.ts` sudah `.passthrough()`, jadi berkas lama tetap terbaca.

## 8. Yang sengaja TIDAK dikerjakan

**Pasangan "dari mana / ke mana".** Dua kolom memberi tahu E menerima 130jt,
bukan bahwa itu dari A(50) + B(35) + D(45). Pemilik aplikasi sudah memutuskan
ini tidak diperlukan sekarang.

Dicatat untuk pembaca berikutnya: kalau suatu saat **daftar perpindahan** dibuat
(20 baris `dari → ke → nominal`), kolom Bertambah/Berkurang **didapat gratis** —
tinggal dijumlah, dan keduanya tak mungkin berselisih. Sebaliknya tidak berlaku:
dari dua kolom, daftar perpindahan tidak bisa direkonstruksi selamanya. Jadi ini
bukan jalan buntu, tapi juga bukan langkah menuju ke sana.

**Uraian tangan di baris induk** — §4, induk selalu dijumlah dari anak.

**Backfill data lama** — mustahil, §7.

## 9. Definition of Done

- [x] Migrasi + cermin di `docs/schema-mysql.sql`; dijalankan pada data nyata,
      558 baris 2026 tetap menampilkan angka yang sama persis
- [x] Baris satu arah tampil benar **tanpa diketik** (A → Berkurang 100jt)
- [x] Baris dua arah menerima uraian tangan dan **bertahan** sesudah menyunting
      sel lain — temuan §2.1, ini uji yang paling menentukan
- [x] `bertambah − berkurang ≠ selisih` ditolak, pesannya menyebut rekeningnya
- [x] Nilai negatif ditolak
- [x] Uraian tangan hanya bisa diisi di baris daun
- [x] Induk = jumlah anak, bukan turunan selisihnya sendiri
- [x] Total Bertambah = total Berkurang tampil di layar dan dokumen (463/463)
- [x] Sesudah Tutup Pergeseran, uraian ikut kosong
- [x] Salin Tahun tidak membawa uraian
- [x] Sinkronkan DPA: baris baru lahir tanpa uraian
- [x] Snapshot riwayat **lama** bisa dipulihkan lalu disimpan — temuan §2.2
- [x] Berkas cadangan Drive lama bisa dimuat
- [x] Dokumen Excel 14 kolom, `Selisih` tetap rumus `I−F`
- [x] Panel Beranda & Cetak menyaring daun (L85) — nominal tidak berlipat
- [x] Realisasi tidak bergerak sedikit pun: pagu, sisa, % serapan, dan hitungan
      menembus/mepet identik sebelum-sesudah pada data 2026
- [x] Regresi `scripts/test-blud-urai-geser.mts`, uji mutasi yang wajib
      tertangkap: (a) recalc menimpa uraian tangan, (b) kolom baru diwajibkan
      di Zod, (c) `tutupPergeseranRows` tidak mengosongkan, (d) rollup induk
      diturunkan dari selisihnya sendiri, (e) validasi invarian dilepas,
      (f) daun tidak disaring, (g) `pergeseranKeInput` tidak membawa kolom

## 10. Urutan

1. **Migrasi + `uraiGeser()` + tipe + Zod** — dasar; belum kelihatan di layar
2. **recalc** (jangan timpa + rollup) — di sinilah temuan §2.1 hidup atau mati
3. **Layar Pergeseran** — kolom, input, validasi, total
4. **Jalur yang mengganti baris** — Tutup, Inject, Generate, Salin Tahun (L69:
   semuanya, sekaligus, jangan sebagian)
5. **Dokumen** — Excel + Cetak
6. **Panel Beranda** — uraian ikut ditampilkan, dengan saringan daun


## 11. Yang berubah saat dikerjakan

**recalc ternyata tidak perlu disentuh sama sekali.** Rancangan §2.1 mengandaikan
`recalcPergeseranJumlah` diberi syarat "isi hanya kalau NULL". Ternyata tidak
perlu: karena tak ada nilai turunan yang disimpan, kedua kolom lolos sendiri
lewat sebaran `{ ...r }`. Jebakan §2.1 dihindari dengan **tidak menambahkan**
pengisian otomatis, bukan dengan menjaganya. Yang ditinggalkan di sana komentar
larangan — supaya orang berikutnya tidak menambahkannya dengan niat baik.

**Dua cacat yang hanya ketahuan saat dijalankan**, keduanya soal kekhususan CSS:

1. Warna sebaris pada `<input>` tidak pernah menang. Baris tabel memasang
   `.row-child td input { color: #FFFFFF !important }`, jadi penanda "diketik
   tangan" tak pernah muncul. Diganti kelas.
2. Kotak merah untuk uraian yang tidak cocok **juga** tidak muncul, dan ini lebih
   serius karena spanduknya menjanjikan "kotaknya bergaris merah". Lawannya
   aturan borongan di `<style>` sebaris:
   `[data-theme="light"] input:not([type=checkbox]):not([type=radio]):not([type=file])`
   = kekhususan (0,4,1), sedangkan `table tbody td input.pg-urai.salah` cuma
   (0,2,4). Dua-duanya `!important`, jadi kekhususan yang memutuskan — dan
   selektornya kalah. Dinaikkan ke (0,4,4) lewat `[type="number"]:not([readonly])`,
   dengan hitungannya ditulis di komentar. Pelajaran L82 lewat pintu ketiga.

**Uji Excel diganti workbook sungguhan.** Semula memeriksa teks sumber; sekarang
`buatWorkbookPergeseran` dipanggil betulan lalu selnya dibaca balik. Itu yang
membuktikan induk memuat **rollup 45/87**, bukan turunan selisihnya sendiri
(−42 → `''`/42) — §4 di dokumen, bukan cuma di layar. Baris headernya **dicari**,
tidak ditebak: `tulisJudul` menyisipkan kop di atasnya.

**Uji regresi lama ikut disesuaikan.** `test-pergeseran-pj.mts` mematok "12
kolom" dan indeks PJ/Keterangan secara mati. Sekarang 14, dan indeksnya
**dicari dari nama kolom** — menambah kolom lagi tidak boleh membuat tes itu
salah menuduh. Lima berkas uji lain butuh `bertambah`/`berkurang` di fixture-nya
karena `PergeseranBaris` bertambah dua field wajib.

**Diverifikasi di aplikasi yang jalan** (data uji dimasukkan lalu dikosongkan
lagi): migrasi dijalankan pada 2.232 baris 2026 → jumlah/pergeseran/selisih
**identik** sebelum-sesudah · uraian 150.000/50.000 diketik lalu sel baris LAIN
disunting → **tetap 150.000/50.000** (inti §2.1) · uraian tak cocok → kotak
`rgb(226,75,74)` + spanduk · server menolak 400 `URAIAN_GESER_TIDAK_COCOK` dengan
menyebut `5.1.01.99.99.9999.01.08.0002` · simpan benar → 200, dibaca ulang tetap
150.000/50.000 sedangkan baris satu arah tetap `null` (bukan 0) · total berubah
dari 100.000 jadi **150.000/150.000** — dokumen mulai menyebut pergerakan KOTOR,
bukan cuma netnya · pagu versi terbaru tetap 637.469.569.000 dan akar
68.383.000.000.

Regresi: `npx tsx scripts/test-blud-urai-geser.mts` (56), **8 uji mutasi
tertangkap** — satu lebih banyak dari rencana §9 (ditambah: layar mengoper objek
uraian, yang mematikan `memo` L81b). Satu mutasi sempat **LOLOS**: saringan daun
di `periksaUraian` tidak tertangkap karena pohon ujinya tak punya satu pun INDUK
yang menyimpan uraian — kasus yang justru nyata (daun berurai lalu dapat anak).
Ditambahkan, dan mutasinya langsung tertangkap.
