# CONCEPT — Ekspor & Impor DPA BLUD (+ Pergeseran)

> Status: **konsep, belum dieksekusi** · Disusun 2026-08-04
> Modul: `blud/dpa`, `blud/pergeseran` · Bahan uji: `DPA BLUD 2026 F.xlsx` (formulir manual provinsi) + `rekap_dpa_blud_20260804.xlsx` (unduhan sistem)

---

## 1. Kenapa dikerjakan berurutan: ekspor dulu, impor belakangan

Tujuan akhirnya satu tombol **Impor** di menu DPA yang mengisi tabel sampai ke level baris yang benar, baik dari formulir manual maupun dari file yang diunduh sistem sendiri.

Masalahnya, file unduhan sekarang **tidak membawa pohonnya**. Sudah diperiksa langsung: `rekap_dpa_blud_20260804.xlsx` berisi 13 baris × 8 kolom, `merges: []`, `indent = 0` di semua baris, `bold = 0` bahkan pada baris induk, dan seluruh angkanya angka mati. Baris `5.2` (Belanja Modal), `5.2.2` (Peralatan dan Mesin), dan baris daunnya semua bernilai 174.500.000 — dari file itu tidak ada cara menentukan apakah `5.2.2` anak atau saudara dari `5.2`.

Menebaknya lewat jumlah segmen kode juga gugur, dan ini terbukti di data nyata:

```
5.1.01.99.99.999.01.01.0002       →  9 segmen  →  MEMBER
5.1.02.99.99.9999.02.01.0059.01   → 10 segmen  →  MEMBER      ← level sama, segmen beda
5.1.1                             →  3 segmen  →  CHILD
  └ anaknya                       →  9 segmen  →  MEMBER      ← turun 1 level, segmen lompat 6
```

`kode_rekening` adalah **kode akuntansi Kemendagri, bukan alamat pohon**. Panjangnya mengikuti aturan penganggaran, bukan kedalaman baris di DPA.

Sebaliknya, formulir manual justru menuliskan hierarkinya **dua kali** — lewat posisi (kode dipecah ke 11 kolom) dan lewat rumus (`SUM(S50:S51)` menyebut sendiri baris anaknya). Karena itu urutan kerjanya dibalik: **perbaiki dulu eksporter supaya ikut menuliskan hierarki, baru buat importer.** Hasilnya importer cukup **satu pembaca** untuk dua jenis file, bukan dua.

---

## 2. Bagian I — Eksporter DPA & Pergeseran

### 2.1 Pemisahan dari eksporter umum

`exportToExcel()` di `lib/blud/export/excel.ts` sekarang melayani lima tampilan dengan cara menukar nama kolom. DPA dan Pergeseran dipindah ke eksporter dokumen tersendiri; **rekap PJ, kode besar, dan tampilan lain tetap memakai yang lama, tidak disentuh.**

**Koreksi rencana awal:** blok tanda tangan `lib/blud/export/spj-excel.ts` ternyata **tidak bisa dipakai ulang**. Berkas itu server-side — mengimpor `getBukuKas`, `getPejabatCetak`, `getPaguEfektif` yang semuanya menyentuh `sql` — sedangkan eksporter ini jalan di browser. `tandaTangan()`-nya pun tidak diekspor dan terikat pada tipe `Konteks` milik SPJ. Jadi blok tanda tangan ditulis lokal (±35 baris) di `dpa-dokumen.ts`, dengan bentuk yang meniru lembar SPJ.

### 2.2 Tata letak

Meniru formulir DPA manual, **kecuali kode rekening tetap satu kolom** (keputusan pengguna — formulir 11 kolom terlalu lebar untuk dibaca sehari-hari).

```
baris 1   RINCIAN BELANJA ANGGARAN                    (gabung A:H, tebal, tengah)
baris 2   BADAN LAYANAN UMUM DAERAH
baris 3   RSJD Dr. AMINO GONDOHUTOMO PROVINSI JAWA TENGAH
baris 4   TAHUN ANGGARAN <tahun>
baris 5   (kosong)
baris 6   header tabel
baris 7+  data
```

**Blok kepala Program / Kegiatan / Sub Kegiatan sengaja TIDAK dicetak** — keputusan pengguna 2026-08-04. Tidak disimpan di mana pun, dan tidak dikosongkan berlabel; benar-benar dihilangkan.

Kolom:

| Kol | Isi | Catatan |
|---|---|---|
| A | Kode Rekening | satu kolom, apa adanya |
| B | Uraian | diindentasi sesuai kedalaman |
| C | Vol | |
| D | Satuan | |
| E | Harga | `#,##0`, rata kanan |
| — | *Vol* | sengaja **tanpa** format angka. `#,##0.##` membuat Excel tetap mencetak pemisah desimal walau nilainya bulat (vol 1 tampil `1,`), sedangkan vol `DECIMAL(18,4)` tetap harus bisa menampilkan pecahan — `General` memenuhi keduanya |
| F | **Jumlah** | **rumus**, `#,##0`, rata kanan |
| G | Penanggung Jawab | |
| H | Keterangan | |
| I | *Level* | **tersembunyi** — `Level 1` … `Level 8.1` |
| J | *Jangkar* | **tersembunyi** — `anggaran_key` |

Kolom tersembunyi ditaruh **di belakang** supaya huruf kolom yang terlihat tetap A–H dan rumusnya mudah dibaca manusia.

Kerapian yang diperbaiki: header digabung + diberi warna, lebar kolom wajar, garis tabel, angka rata kanan monospace (sesuai design system: monospace untuk semua angka keuangan), baris induk ditebalkan, uraian diindentasi per level, dan panel dibekukan di baris 7 supaya header tidak hilang saat digulir.

### 2.3 Rumus — identik dengan `recalcDpaJumlah()`

Aturan di aplikasi cuma dua ([`recalc.ts:94`](../lib/blud/recalc.ts)):

```
daun  (0 anak, tipe EDITABLE) : jumlah = Math.round(vol × harga)
induk (≥1 anak)               : jumlah = Σ anak LANGSUNG
```

Terjemahan ke sel:

| Kondisi baris | Sel kolom F |
|---|---|
| Daun | `=ROUND(C7*E7,0)` |
| Induk, anak berderet | `=SUM(F8:F10)` |
| Induk, anak terpencar | `=F8+F15` |
| `GRANDMASTER` tanpa anak (DPA kosong) | `0` — bukan rumus |

`ROUND(...,0)` **wajib**, bukan `C7*E7` polos: `hitungJumlah()` memakai `Math.round`, sedangkan `vol` disimpan `DECIMAL(18,4)`. Tanpa pembulatan, baris dengan vol pecahan meleset beberapa rupiah, selisihnya merambat ke atas lewat `SUM`, dan importer nanti melaporkan "total tidak cocok" padahal tidak ada yang salah.

Karena induk menjumlah **anak langsung** (yang isinya rumus juga), hasilnya bertingkat — sama seperti formulir manual yang menulis `S11 = S12+S13` lalu `S13 = S14+S77`.

Setiap sel rumus **tetap menyimpan hasilnya** (`{ formula, result }`) supaya file terbaca di pembaca yang tidak menghitung ulang.

Verifikasi terhadap data nyata:

```
F7  =ROUND(C7*E7,0)  = 3.569.531.000   Gaji Pokok PPPK
F6  =SUM(F7:F9)      = 4.194.531.000   Belanja Pegawai
F5  =F6+F10          = 5.560.531.000   Belanja Operasi BLUD
F4  =F5+F13          = 5.735.031.000   Belanja Daerah
```

Keempatnya sama persis dengan `dpa_blud`.

**Pergeseran** mengikuti pola yang sama sesuai `recalcPergeseranJumlah()`: kolom Pergeseran memakai `=ROUND(vol_p*harga_p,0)` / `SUM`, dan kolom Bertambah-Berkurang `= pergeseran − jumlah`.

### 2.4 Kolom Level — cadangan, bukan hiasan

Kalau rumus jadi satu-satunya penyimpan pohon, sekali file kena *paste as values* (atau dibuka-simpan ulang di WPS/Google Sheets yang kadang menulis ulang rumus) hierarkinya lenyap tanpa cadangan. Kolom `Level` (isi dari peta tipe→label yang sudah ada di `lib/blud/format.ts`) membuat importer tetap bisa menyusun pohon dari urutan baris + level lewat stack. Ongkosnya nyaris nol.

### 2.5 Kolom Jangkar — syarat impor yang aman

`anggaran_key` adalah identitas baris anggaran lintas-versi, dan **`blud_realisasi_alokasi` menempel padanya**. Impor yang mengganti seluruh DPA dengan baris serba-baru akan mencetak `anggaran_key` baru pula, dan alokasi realisasi lama menunjuk ke sesuatu yang tidak ada lagi.

Perlu ditegaskan: pagar `periksaJangkar()` yang ada di `saveDpa` **tidak menangkap kasus ini** — komentarnya eksplisit, *"baris yang benar-benar baru punya row_id baru pula, jadi tidak pernah cocok di sini — impor besar atau susun ulang dari nol tidak akan ikut tertahan"* ([`data.ts:274`](../lib/blud/data.ts)). Pagar itu menjaga baris lama yang membuang jangkarnya, bukan baris baru yang menggantikan.

Karena itu kolom `Jangkar` ikut diekspor. Saat file sendiri diimpor balik, jangkar lama **dipakai ulang**, realisasi tetap menempel di tempatnya. Untuk file manual dari luar (tidak punya kolom ini), lihat §3.6.

### 2.6 Keamanan — rumus tidak boleh jadi lubang

`sanitizeCell()` ([`excel-export.ts:21`](../lib/shared/excel-export.ts)) sengaja melumpuhkan teks yang diawali `= + - @` supaya tidak dieksekusi Excel (CWE-1236). Begitu kita mulai menulis rumus dengan sengaja, aturannya dipertegas — **bukan dilonggarkan**:

- Rumus **hanya** lahir dari generator kita, **hanya** di kolom Jumlah/Pergeseran, dan isinya hanya rujukan sel + `ROUND`/`SUM`/`+`.
- Kolom Uraian, Penanggung Jawab, Keterangan **tetap** lewat `sanitizeCell()`.
- Tidak ada nilai dari database yang pernah diinterpolasi ke dalam string rumus.

Kalau pagar ini dilonggarkan menyeluruh, siapa pun yang bisa mengetik uraian bisa menitipkan rumus ke berkas yang dibuka orang lain.

### 2.7 Blok tanda tangan

Keputusan pengguna, **direvisi 2026-08-05**: yang dicetak **hanya tanda tangan Direktur**. Blok Dewan Pengawas dihapus seluruhnya — rencana awal "kosong berkerangka" ditinggalkan karena formulir kerja sehari-hari memang tidak memuatnya, dan kerangka yang tidak pernah diisi cuma jadi sampah di bawah tabel.

Yang dicetak: `Semarang, ....` · `Direktur` · nama instansi & provinsi · ruang tanda tangan · nama & NIP dari `blud_pejabat`. Kalau data pejabat tidak terambil, nama dan NIP ikut bergaris untuk diisi tangan.

Tidak ada peran baru, **tidak ada perubahan struktur database sama sekali**.

Keputusan #29 di [`pejabat-data.ts:8`](../lib/blud/pejabat-data.ts) tetap berlaku: nilai pejabat adalah **salinan beku**, bukan sambungan hidup ke Master PK, supaya dokumen yang sudah ditandatangani tidak berubah sendiri saat master diperbarui.

---

## 3. Bagian II — Importer & algoritma deteksi

### 3.1 Bentuk endpoint

Meniru pola yang sudah terbukti di impor Renaksi:

```
POST /api/blud/dpa/import?step=preview   multipart  → parse-only, TIDAK menyentuh DB
POST /api/blud/dpa/import?step=commit    JSON       → baris hasil konfirmasi user
```

Akses ADMIN / SUPER_ADMIN saja (cermin `import-usulan`), di belakang kill-switch BLUD dan `app/api/blud/_guard.ts`. Audit: `BLUD_DPA_IMPORT_PREVIEW` / `BLUD_DPA_IMPORT_COMMIT`.

Batas wajar dipasang di parser: cap jumlah sheet (**L67**, anti zip-bomb), cap jumlah baris, cap ukuran berkas.

### 3.2 Dua bentuk file, satu pembaca

| | Formulir manual | Unduhan sistem (setelah §2) |
|---|---|---|
| Kode rekening | 11 kolom terpisah (A–K) | 1 kolom |
| Kedalaman | posisi kolom | kolom `Level` |
| Rumus | ada (terverifikasi) | ada (dibuat §2.3) |
| Jangkar | tidak ada | ada |

Pembacanya satu, cuma sumber sinyalnya beda. Deteksi bentuk dilakukan dari **baris header** (dicari lewat teks `KODE REKENING`/`Kode Rekening`, **tidak dipatok nomor baris** — di formulir manual header ada di baris 9, di unduhan di baris 6).

**Posisi kolom berpindah antar tahun.** Terverifikasi pada tiga formulir asli:

| | 2024 | 2025 | 2026 |
|---|---|---|---|
| Lembar | `2024` | **`Pagu 57`** (+ `Sheet1` kosong) | `BLUD ` |
| Kolom Jumlah | **T (20)** | **T (20)** | **S (19)** |
| Kolom Harga | S (19) | S (19) | R (18) |
| Faktor vol ke-2 | Q (17) | Q (17) | P (16) |
| Kolom PJ | U (21) | — | T (20) |
| Pola perkalian dominan | `N*Q*S` ×149 | `N*Q*S` ×134 | `N*R` ×142 |

Karena itu **tidak ada satu pun nomor kolom yang boleh ditulis mati** dalam kode. Kolom Jumlah ditemukan dari kolom mana yang paling banyak berisi rumus perkalian; kolom vol dan harga dibaca **dari isi rumus itu sendiri**. Nama lembar juga tidak boleh dipatok — lembar yang dipakai adalah yang memuat `KODE REKENING` (dan lembar kosong diabaikan).

### 3.3 Algoritma — lima lapis

**Lapis 1 — potong badan tabel.** Buang segala yang di atas baris header (baris 9 di ketiga formulir, tapi **tetap dicari lewat teks** `KODE REKENING`, tidak dipatok).

Batas bawahnya **JANGAN** dicari lewat kata `DEWAN PENGAWAS` — ini jebakan yang sudah terbukti. `Dewan Pengawas BLUD` adalah **nama mata anggaran** (honorarium dewas), bukan blok tanda tangan:

```
2026 baris 200   5|1|02|99|99|9999|02|01|004|03   Dewan Pengawas BLUD   =S201+S202
2024 baris 182   5|1|02|99|99|9999|02|01|004|03   Dewan Pengawas BLUD   =SUM(T183:T183)
2025 baris  78                                    Dewan Pengawas BLUD   =T79+T80
```

Memotong di situ akan membuang **±500 baris** di file 2026 (data sebenarnya lanjut sampai baris 702) dan ±400 baris di file 2024.

Aturan yang benar: **badan tabel berakhir di baris terakhir yang punya nilai di kolom Jumlah.** Blok tanda tangan tidak pernah punya angka di kolom itu. Penanda teks hanya dipakai sebagai pemeriksa kedua, dan harus lengkap (`DEWAN PENGAWAS RSJD…`, `Ketua Dewan Pengawas`), bukan penggalan.

**Lapis 2 — kedalaman mentah, tiga sumber.** Diambil sesuai ketersediaan, berurut dari yang paling pasti:

1. Kolom `Level` — dibaca langsung, selesai.
2. Rujukan rumus — `SUM(F8:F10)` / `=F8+F15` menyebut sendiri anaknya, jadi pohonnya dibaca dari situ.
3. Posisi kolom kode — jumlah kolom terisi dari A–K.

Baris tanpa kode tapi berisi uraian (di formulir manual banyak: baris 46 `Belanja Honorarium Pegawai BLUD` sama sekali tidak berkode) ditambatkan ke baris berkode terakhir di atasnya lewat stack, satu tingkat lebih dalam.

**Lapis 3 — pemetaan ke rantai L1→L8.1.** DPA punya 15 tipe (`GRANDMASTER` … `L8-SUB`), formulir bisa punya kedalaman 2–11. Pemetaan **tidak** lurus. Caranya: kumpulkan semua kedalaman berbeda yang benar-benar muncul, urutkan, lalu petakan berurutan ke slot rantai. File yang cuma memakai 6 tingkat berhenti di L4.1 — tidak dipaksa sampai L8.

**Lapis 4 — angka.** Kolom vol/satuan/harga **tidak** ditentukan dari header, tapi diverifikasi isinya per baris — di formulir manual kolomnya bergeser (baris 46 `1 x 1 th`, baris 130 `1 x th`). Rumus perkalian `N19*R19` justru menunjuk langsung kolom mana vol dan mana harga, jadi dipakai lebih dulu kalau ada.

**Vol majemuk wajib ditangani — bukan pemanis.** Formulir memakai pola `1 x 12 bln`, dan rumusnya tiga faktor:

```
baris 57   vol=1  x  vol2=12  satuan=bln  harga=1.000.000   =N57*P57*R57
baris 58   vol=1  x  vol2=12  satuan=bln  harga=  550.000   → 6.600.000
```

Kalau dibaca naif sebagai vol × harga, baris 58 jadi 550.000 — **meleset 12 kali lipat**. Jadi: vol = hasil kali seluruh faktornya (1 × 12 = 12), satuan = token teks terakhir (`bln`), **string aslinya disimpan ke `keterangan`** supaya tidak ada yang hilang diam-diam. Jumlah faktor **dibaca dari rumusnya** (`N*R` dua faktor, `N*P*R` tiga faktor), bukan ditebak dari posisi kolom — inilah alasan lain rumus didahulukan.

**Lapis 5 — hitung ulang, lalu bandingkan.** Nilai dihitung ulang dengan `recalcDpaJumlah()` — **bukan** disalin dari file — lalu hasilnya dibandingkan dengan angka di file. Selisihnya dilaporkan berikut angkanya, per baris. Ini penangkap paling berguna: kalau file bilang akar 68.383.000.000 tapi hitungan kita beda, berarti ada baris yatim atau rumus kosong.

### 3.4 Yang membuatnya "pintar": dua bacaan yang saling memeriksa

Formulir manual menyimpan hierarki **dua kali** — posisi kolom dan rujukan rumus. Terverifikasi pada kolom S baris 11–702:

```
SUM(rentang)      :  39 baris
penjumlahan sel   : 143 baris     (S11 = S12+S13, S13 = S14+S77)
perkalian         : 188 baris     (S19 = N19*R19)
shared formula    : 198 baris
angka diketik mati:   0 baris
```

Jadi algoritmanya **bukan menebak, tapi membaca dua kali lalu mencocokkan**. Baris yang kedua bacaannya sepakat dianggap pasti dan tidak perlu ditanyakan. Yang berselisih naik ke modal. Modalnya jadi sepi — hanya menampilkan yang benar-benar meragukan.

Catatan soal *shared formula* (Excel menyimpan satu rumus induk, sisanya ditandai "sama seperti itu, digeser"). Dari 198 baris tersebut, **178 tetap menyimpan hasilnya** dan hanya **20 yang tidak** — dan ke-20 baris itu kolom vol serta harganya juga kosong, jadi memang baris kosong, bukan data yang hilang. Dampaknya kecil: untuk 20 baris itu angka file tidak bisa dipakai sebagai pembanding silang. Tetap dinyatakan di modal, bukan didiamkan.

### 3.5 Kekotoran yang sudah diketahui ada

Semuanya terverifikasi di `DPA BLUD 2026 F.xlsx`, jadi bukan kekhawatiran karangan:

| Masalah | Bukti | Perlakuan |
|---|---|---|
| Kolom bergeser | baris 46 `1 x 1 th` vs 130 `1 x th` | verifikasi isi per baris; rumus jadi rujukan utama |
| Padding hilang | 692 `5\|2\|6` vs 693 `5\|2\|06`; 698 `7:1` vs 696 `7:01` | normalisasi segmen saat membandingkan |
| Kode yatim | baris 38 `5\|1\|04\|01\|11` nyempil di blok `5\|1\|01\|99\|99` | ditahan + dilaporkan, tidak membatalkan impor |
| Rumus tanpa hasil | 20 baris `sharedFormula` (mis. 26, 27, 36–38) | hitung sendiri; jangan dipakai sebagai pembanding |
| Vol majemuk 3 faktor | baris 58 `1 x 12 bln` → `N*P*R` | vol = hasil kali faktor; naif = meleset 12× |
| Kolom catatan campur | kol 20: `diklat`, `mdsi`, tapi juga `3702000` | cocokkan ke master `penanggung_jawab`; tidak cocok → `keterangan` (**L68**) |
| Baris tanpa kode | 11 `BELANJA DAERAH`, 12 `BELANJA MODAL`; 48–62 baris per file | ditambatkan lewat stack |
| **Harga pun bisa rumus** | 2026 b.204 `=17647195237-3835200000-…`; 2025 b.77 `=90000000+12123000-5000000` | baca `.result`; kalau kosong, baris ditahan |
| Induk beranak tunggal | 2026 b.203 `=S204`; 2024 b.185 `=T186` | rujukan sel telanjang tetap dibaca sebagai agregasi |
| Sel sampah | 2026 b.202 kol 22 `=SUM(T1:T3)`; b.205 & b.700 berisi backtick | abaikan kolom di luar peta; jangan ikut dihitung |
| Nama lembar berubah | `2024` · `Pagu 57` · `BLUD ` (+ spasi) | pilih lembar yang memuat `KODE REKENING` |
| PJ tak seragam | 2024 `Kasubbag Perbendaharaan` · 2026 `keuangan`, `mdsi`, `diklat` | cocokkan ke master; tidak cocok → `keterangan` |

### 3.6 Pagar tulis

Commit **tidak menulis sendiri** — ia memanggil `saveDpa()`, sehingga otomatis mewarisi seluruh pagar yang sudah ada dan sudah diuji: kunci optimistik (`assertBludVersion`), ambang jatuh-drastis (`BludReplaceSafetyError`), `periksaJangkar`, `DELETE`+`bulkInsert` dalam satu `withTransaction`.

Tiga hal yang **harus ditambahkan** karena `saveDpa` tidak menanganinya:

1. **Impor selalu ke versi baru** (`versi_tanggal` baru), tidak pernah menimpa versi terbaru di tempat.
2. **Pemetaan jangkar.** Kalau file punya kolom `Jangkar` → pakai ulang, realisasi aman. Kalau tidak (file manual) → cocokkan ke baris versi terbaru lewat `kode_rekening` + `uraian`, **tampilkan hasil pencocokan di modal untuk dikonfirmasi**, dan tandai baris yang tidak menemukan pasangan.
3. **Peringatan realisasi terdampak.** Sebelum commit, hitung alokasi di `blud_realisasi_alokasi` tahun itu yang jangkarnya akan hilang. Kalau ada, tampilkan daftarnya dan minta konfirmasi eksplisit. Ini syarat, bukan pemanis — akibatnya (realisasi yatim) tidak terlihat di layar mana pun.

### 3.7 Modal

Satu tombol **Impor** di toolbar DPA; dua bentuk file ditangani di dalam, bukan dua tombol.

Isi modal: panel pemetaan kolom (bisa dikoreksi manual) · panel pemetaan level (kedalaman file ↔ slot rantai, bisa digeser) · pratinjau pohon dengan indentasi + badge level · panel neraca (total hitung ulang vs total file) · daftar baris bermasalah · daftar realisasi terdampak (§3.6.3).

Untuk file unduhan sendiri, modalnya praktis kosong: *"semua terbaca dari kolom Level, 0 baris perlu diperiksa."*

Baris bermasalah **ditahan, tidak membatalkan seluruh impor** — sama seperti impor Renaksi.

### 3.8 Hubungan dengan Sentinel Guard

Laporan deteksi **tetap di modal, tidak dipindah ke Sentinel.** Modal impor itu pos pabean — sekali lewat, ada keputusan, selesai. Sentinel adalah pengawas berkelanjutan atas form yang sedang diedit. Menggabungkannya membuat Sentinel jadi tempat sampah notifikasi dan orang berhenti membacanya.

Yang diwarisi Sentinel tanpa kode baru: setelah baris hasil impor mendarat di form, `lib/blud/dup-guard.ts` yang ada langsung bekerja — banner duplikat (uraian + satuan + harga kembar) menyala sendiri.

Yang **ditambahkan** ke Sentinel: satu aturan — *baris hasil impor yang jumlahnya tidak cocok dengan file asal*. Itu memang perlu diingatkan terus, karena orang bisa mengedit setelah impor.

---

## 4. Rencana kerja

| # | Pekerjaan | Berkas | Status |
|---|---|---|---|
| E1 | Eksporter dokumen DPA (tata letak, rumus, kolom Level + Jangkar, tanda tangan) | `lib/blud/export/dpa-dokumen.ts` (baru) | ✅ |
| E2 | Eksporter Pergeseran mengikuti pola sama | idem | ✅ |
| E3 | Sambungkan tombol unduh; empat tampilan lain tetap ke eksporter lama | `blud/cetak/cetak-client.tsx` | ✅ |
| I1 | Pembaca grid + deteksi bentuk file | `lib/blud/import-dpa-grid.ts` (baru) | ✅ |
| I2 | Algoritma 5 lapis + pembangun pohon | `lib/blud/import-dpa.ts` (baru) | ✅ |
| I3 | Route preview/commit + Zod + audit + rate limit | `app/api/blud/dpa/import/route.ts` (baru) | ✅ |
| I4 | Modal impor + tombol di toolbar DPA | `components/blud/ImportDpaModal.tsx` (baru) | ✅ |
| I5 | Satu aturan Sentinel (jumlah ≠ file asal) | — | ❌ **dibatalkan** |

**Kenapa I5 dibatalkan.** Rencana awal menganggap baris hasil impor mendarat di *form* yang masih diedit, sehingga Sentinel bisa mengawasinya terus. Ternyata tidak: commit menulis langsung ke basis data lalu layar memuat ulang. Untuk mengawasi "jumlah ≠ berkas asal" sesudah itu, angka asal dari berkas harus ikut disimpan — kolom baru di `dpa_blud` semata untuk satu peringatan. Tidak sepadan, dan §5 memutuskan **tidak ada perubahan skema**.

Tempat keputusan itu diambil memang di modal, sebelum commit — di situlah selisihnya ditampilkan per baris. Yang tetap didapat gratis: `validateDupRules()` di [dpa-client.tsx:483](../app/(dashboard)/blud/dpa/dpa-client.tsx) berjalan atas SELURUH baris di layar, jadi baris hasil impor otomatis kena banner "kemungkinan entri ganda" tanpa satu baris kode pun ditambah.

**Tidak ada migrasi database.** Tidak ada kolom atau tabel baru.

### Uji

- `scripts/test-dpa-export.mjs` ✅ **40 pemeriksaan lolos** — rumus daun/induk/beranak-tunggal/terpencar, `ROUND` pada vol pecahan, kolom Level+Jangkar tersembunyi tapi terisi, hasil tersimpan di sel, blok tanda tangan (Direktur terisi, Dewas kosong), dan bertahan setelah workbook ditulis-baca ulang. Tanpa DB, tanpa DOM.
  Diuji juga terhadap **12 baris DPA 2026 asli**: 0 selisih antara hasil di sel dan `jumlah` di database. Rantai beranak-tunggal `5.2 → 5.2.2 → daun` yang dulu ambigu kini tertulis tegas `=SUM(F17:F17)` / `=SUM(F18:F18)`.
- `scripts/test-dpa-import.mjs` ✅ **31 pemeriksaan lolos** — menerima folder, menyusuri semua `.xlsx` di dalamnya. Round-trip atas hasil ekspor sendiri identik 100% (`tipe_baris`, induk, `anggaran_key`, nilai). Hasil atas tiga formulir asli:

  | Berkas | Baris | Total berkas | Hitung ulang | Selisih |
  |---|---|---|---|---|
  | 2026 | 558 | 68.383.000.000 | 68.383.000.000 | **0** |
  | 2024 | 453 | 59.000.000.000 | 58.940.000.000 | 60 jt (0,10%) |
  | 2025 | 466 | 57.000.000.000 | 56.870.750.000 | 129 jt (0,23%) |

  Sisa selisih 2024/2025 **bukan disembunyikan** — tiap barisnya dilaporkan lengkap dengan nomor barisnya, untuk dikonfirmasi di modal. Sebabnya struktur berkas itu sendiri: ada 3 baris judul kembar (`b.434/439/440` di 2024) yang **rumusnya identik persis** `T441+T481+T487+T527`, jadi ketiganya mengklaim anak yang sama. Tidak ada bacaan yang bisa benar untuk ketiganya sekaligus.

- Empat bug ditemukan lewat pengujian ini, semuanya nyata dan sudah ditutup:
  1. **Judul kolom digabung 2 baris** → header 1 baris ikut menelan baris data (`Level` + `Level 1`), kolom Level tak pernah ketemu.
  2. **Judul URAIAN tidak bisa dipercaya** — di formulir 2025 sel itu tertimpa jadi `"pemeliharaa"`. Deteksi diganti jadi struktural (kolom antara kode dan vol).
  3. **Baris diklaim dua induk** → semula pengklaim pertama menang, membuat baris nyata jadi daun kosong. Diganti: **pengklaim terdekat** menang.
  4. **Baris sisa salin-tempel** (b.108 di 2026: rumus saja, tanpa uraian/kode/hasil) menempel sebagai anak baris di atasnya, mengubah daun jadi agregator sehingga vol × harga miliknya dibuang — Rp 170 juta hilang dan menyeret selisih Rp 351 juta sampai ke akar. Setelah ditutup, total 2026 **cocok sampai rupiah terakhir**.

- Unduhan format **lama** (8 kolom datar, tanpa Level, tanpa rumus) sengaja **DITOLAK** dengan pesan yang menyuruh unduh ulang — bukan ditebak. Menebak di situ menghasilkan pohon yang tampak masuk akal tapi salah tanpa gejala.
- Uji negatif: file dengan rumus dibuang (*paste as values*) → harus jatuh ke kolom Level dan tetap benar; file tanpa kolom Level **dan** tanpa rumus → harus melapor jujur bahwa hierarki ditebak.

### Kalibrasi

Sudah dikalibrasi atas **tiga** formulir manual: `DPA BLUD 2024.1.xlsx`, `DPA BLUD 2025...xlsx`, `DPA BLUD 2026 F.xlsx`. Skrip uji menerima **folder**, bukan satu berkas, supaya file baru tinggal dijatuhkan ke folder itu tanpa mengubah kode (pola sama dengan `test-renaksi-import.mjs` / `test-iki-import.mjs`).

Kalibrasi ini langsung membayar: penanda footer, posisi kolom Jumlah/Harga, jumlah faktor vol, dan nama lembar **semuanya berbeda antar file** — tiga dari empat baru ketahuan setelah file kedua dan ketiga masuk.

Sebaran kedalaman juga jauh berbeda (2025 dangkal, mayoritas 5–6 segmen; 2024 sampai 11 segmen), yang menegaskan pemetaan level harus berbasis peringkat kedalaman yang benar-benar muncul di file, bukan jumlah segmen mentah.

---

## 5. Keputusan yang sudah diambil (2026-08-04)

| Hal | Keputusan |
|---|---|
| Kode rekening di ekspor | Tetap **satu kolom** |
| Blok Program/Kegiatan/Sub Kegiatan | **Tidak dicetak sama sekali** |
| Dewan Pengawas | **Kosong berkerangka**, diisi tangan |
| Direktur | Otomatis dari `blud_pejabat` |
| Rumus di kolom Jumlah | **Ya**, `ROUND`/`SUM`/`+` |
| Perubahan skema DB | **Tidak ada** |
| Urutan kerja | Ekspor dulu, impor menyusul |
| Laporan deteksi | Di modal, **bukan** di Sentinel |
