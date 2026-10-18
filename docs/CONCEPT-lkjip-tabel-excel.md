# Konsep — Tabel LKJIP ala Excel + Kepala Tabel di Modal

Status: **Tahap A selesai dikerjakan** (2026-10-18, belum di-commit) — catatan pelaksanaan di §13. Tahap W, B, C belum.
Susulan 2026-10-18: §12 **ala Word**. W1–W2 masuk Tahap A, sisanya Tahap W (baru) dan Tahap C. Isi §12 masih menunggu pilihan pemilik.
Kelanjutan `docs/CONCEPT-lkjip-tabel-tertaut.md` — aturan kunci tabel tertaut di sana tetap berlaku.

## 1. Yang diminta

> *"modal bisa seperti gambar tadi tidak ? tahu mau ditempatkan di kolom mana baris mana biar
> nanti sama persis seperti gambar ?"*
>
> *"ketika saya blok ingin hapus baris atau kolom kok tidak ada tombol delete atau tidak bisa
> tekan delete ya ? dan juga lebar kolom tabel tidak bisa di geser, saya ingin seperti excel"*
>
> *"final konsep dan ditambahi lagi agar seperti excel"*
>
> *"selain itu yang bisa ditambahkan agar bisa seperti word ?"* (→ §12)

Gambar acuan pemakai (dibuat manual di editor, belum bisa dari modal):

```
        A                 B                  C
  ┌──────────────────────────────────┬──────────────┐
1 │             Uraian               │              │
  ├─────────────────┬────────────────┤  Realisasi   │
2 │  target fisik   │ realisasi fisik│              │
  └─────────────────┴────────────────┴──────────────┘
```

## 2. Keadaan sekarang (dibaca dari kode, 2026-10-15)

| Sudah ada | Belum ada / cacat |
|---|---|
| Gabung/pisah, rata H/V, tebal, ukuran huruf, garis, format angka, desimal, latar | Blok dengan **seret** — hanya klik lalu Shift+klik (`onCellDown`) |
| Urungkan/ulangi 60 langkah | Tombol **Delete** — `onKeyDown` hanya mengurus Ctrl+Z/Y/C |
| Salin/tempel antarsel + tempel TSV dari Excel | Hapus baris/kolom **sekaligus** — hanya × satu per satu |
| Bilah rumus `fx`, klik sel untuk menyisip rujukan | Lebar kolom: pegangan 7 px tersembunyi di tepi kanan sel nama kolom saja |
| Header 0–3 baris | Panah/Tab/Enter berpindah sel, langsung mengetik menimpa isi |
| Lebar kolom tersimpan & ikut ke Word | Judul kolom di modal masuk ke baris nama kolom yang **tidak tercetak** saat Header ≥ 1 baris |

Temuan yang ikut ketahuan saat membaca. Semuanya **belum dicoba di layar/Word** dan dibuktikan dari kode saja:

- **T1. Rumus salah membaca angka gaya Indonesia.** `cellNumber` → `parseNumber` membuang semua
  karakter selain `0-9 . -`. Akibatnya "1.250.000" terbaca **1,25** dan "7,5" terbaca **75**,
  jadi `=A1+B1` di atas angka ketikan biasa salah tanpa galat. Penawarnya sudah ada: `angkaTeksId`
  (dibuat untuk grafik), tinggal belum dipakai rumus.
- **T2. Hasil rumus tanpa format ditulis gaya Inggris** (`String(n)` → "1250000.5"), dan begitu
  pula yang masuk ke Word.
- **T3. Tabel ≥ 5 kolom dengan lebar bawaan lebih lebar dari kertas.** Bidang tulis A4 di
  `docgen.ts` = 11.907 − 1.418 − 1.701 = **8.788 dxa (± 15,5 cm)**. Kolom bawaan 140 px × 15 =
  2.100 dxa, jadi 5 kolom = 10.500 dxa (masuk ke margin) dan 8 kolom = 16.800 dxa (± 29,6 cm, keluar dari kertas).
  `colWidths` selalu ikut tersimpan, jadi cabang "bagi rata 9.000" hampir tak pernah dipakai.
- **T4. Rumus kolom di modal tidak ikut saat kolom dipindah.** `geser` hanya menukar urutan,
  ekspresi `=C-D` tetap. Sesudah C dipindah, rumusnya menunjuk kolom lain tanpa galat. Saat
  dihapus, galat memang muncul, tapi rumusnya tidak disesuaikan.
- **T5. Rumus sel tidak ikut bergeser** saat baris/kolom dihapus (`delRow`/`delCol` cuma `filter`).
- **T6. Tempel dari Excel yang lebih lebar dari tabel** membuang kolom kelebihannya diam-diam
  (`pasteRange`: `if (c >= ncol) continue`).
- **T7. Esc saat menyunting sel tidak membatalkan** — sel cuma ditinggalkan, ketikannya tetap.

## 3. Keputusan pokok

| # | Keputusan | Alasan |
|---|---|---|
| E1 | **Kepala tabel selalu berupa sel.** Pilihan "Header: kolom" (0) hilang dari menu; tabel lama ber-0 tetap tercetak sama, dan begitu kepalanya disentuh, ia diubah jadi 1 baris kepala berisi nama kolom | Penyebab kebingungan "judul saya tidak tercetak": ada dua tempat judul (baris nama kolom vs baris kepala), dan yang tercetak bergantung pada pilihan yang tidak terlihat. Keluaran Word 0 vs 1 baris identik (kepala tebal, rata tengah, latar kepala) |
| E2 | **Nama kolom jadi urusan mesin**, diisi otomatis = teks "sel milik kolom" (§4.2) | Grafik memakai nama kolom untuk memilih seri (`tableKolom`), jadi isinya harus judul yang sebenarnya, bukan "Kolom 3" |
| E3 | **"Kepala: N baris" menyisip/membuang baris di ATAS badan**, tidak lagi "meminjam" N baris pertama | Satu aturan dengan tabel tertaut (`gantiBarisKepala` sudah begitu). Membuang baris kepala yang berisi teks ditanyakan dulu |
| E4 | **Satu judul, satu tempat.** Kolom "Judul kolom" di modal = sel milik kolom di kisi kepala, bukan isian kedua | Dua isian untuk satu hal = salah satunya basi |
| E5 | **Satu aturan untuk editor & modal** — gabung, pilih blok, sisip/hapus, geser rujukan: fungsi murni di `lib/lkjip/tabel.ts` + satu hook pilihan sel | L78: dua salinan aturan berbeda pendapat |
| E6 | **Rumus ikut bergeser** saat baris/kolom disisip/dihapus/dipindah, sama seperti Excel. Rujukan ke yang dihapus jadi `#REF!` | T4, T5 |
| E7 | **Word tidak pernah menerima `#ERR`/`#REF!`.** Sel galat dicetak "—", di editor merah, dan Periksa Tabel/Finalisasi menyebut selnya | Sama dengan aturan kolom rumus tertaut (§5.1 konsep tertaut) |
| E8 | **Tabel tertaut tetap terkunci badannya.** Fitur baru menghormati `terkunci(r,c)`; kepala bebas | Konsep tertaut K2/K6 |
| E9 | **Nol tabel/kolom/migrasi/endpoint.** Field sel baru (Tahap B) didaftarkan di `CellSchema`, `normalizeCell`, `extractRange` | Zod membuang kunci tak dikenal: field yang lupa didaftar hilang diam-diam saat Simpan (jebakan yang sama dengan `tautan`) |

## 4. Bagian A — Kepala tabel di modal (Hubungkan ke Modul / Atur Bentuk)

### 4.1 Tampilan

Bagian "2. Kolom tabel" dibuka dengan kisi kepala, dan daftar kolom yang sudah ada tetap di bawahnya:

```
Kepala tabel:  [ 2 baris ▾ ]    [Gabung] [Pisah] [Rapikan ↓]

        A                 B                  C
  ┌──────────────────────────────────┬──────────────┐
1 │             Uraian               │              │
  ├─────────────────┬────────────────┤  Realisasi   │
2 │  target fisik   │ realisasi fisik│              │
  └─────────────────┴────────────────┴──────────────┘

A  [target fisik    ]  [Isi dari… Target Fisik ▾]  ↑ ↓ ×
B  [realisasi fisik ]  [Isi dari… Realisasi    ▾]  ↑ ↓ ×
C  [Realisasi       ]  [Isi dari… Real Keu     ▾]  ↑ ↓ ×
```

- Kisi = baris kepala saja (1–3) × kolom tabel, lebar kolomnya sebanding dengan lebar asli.
- Memilih: klik, seret, Shift+klik (hook pilihan yang sama dengan editor, §5.1).
- Mengetik: dobel-klik / langsung mengetik di sel terpilih; Enter selesai, Esc batal.
- Gabung/Pisah memakai `mergeCells`/`unmergeAt` yang sama dengan editor.
- Pratinjau di bawah tetap menampilkan kepala + badan persis seperti tercetak.

### 4.2 Sel milik kolom (aturan penempatan judul)

> **Sel milik kolom X = sel teratas di kolom X yang lebarnya tepat satu kolom** (tidak tersembunyi gabungan;
> boleh tinggi beberapa baris).

| Keadaan kepala | Judul A | Judul B | Judul C |
|---|---|---|---|
| 2 baris, belum digabung | A1 | B1 | C1 |
| A1:B1 digabung ("Uraian") | **A2** | **B2** | C1 |
| + C1:C2 digabung | A2 | B2 | **C1** (setinggi 2 baris) |

Baris pertama adalah aturan pemakai ("belum digabung → baris paling atas"). Baris kedua dan ketiga adalah bagian "kalau digabung, sesuaikan". Hasil baris ketiga = gambar acuan.

Kolom yang seluruh selnya tertutup gabungan mendatar (mis. 1 baris kepala, A1:B1 digabung) tidak punya sel milik.
Isian judulnya di daftar dimatikan dengan keterangan *"digabung dengan B — ubah di kisi"*.

### 4.3 Gabung di kisi

- Judul kolom yang tertelan gabungan **turun ke sel milik barunya** kalau sel itu kosong.
  Contoh: A1 "target fisik" + B1 "realisasi fisik" digabung → keduanya turun ke A2/B2, dan A1:B1 kosong siap diketik "Uraian".
- Tidak ada tempat untuk turun (sudah baris terbawah, atau sel di bawahnya sudah berisi) →
  dialog tiga jalan (`pilihDialog`): **Tambah 1 baris kepala & gabung** · **Gabung saja** (hanya isi kiri-atas yang tersisa, sama seperti Excel) · Batal.
- Teks yang bukan judul kolom (mis. judul kelompok) mengikuti Excel: yang tersisa hanya kiri-atas.
  Kalau ada teks lain yang terbuang, ditanya dulu.

### 4.4 Pisah di kisi

Judul **tidak berpindah**. Di modal, penunjuk "judul kolom X ada di sel mana" bersifat lengket: ia hanya
dihitung ulang kalau selnya tertutup gabungan, melebar, atau barisnya dibuang. Kalau dihitung ulang
tiap saat, memisah A1:B1 membuat judul A melompat ke A1 yang berisi "Uraian".
Saat modal dibuka, penunjuknya diturunkan dari sel milik yang teksnya = nama kolom (E2 menjaga keduanya tetap sama).

### 4.5 Rapikan ↓

Satu tombol: tiap judul kolom digabung ke bawah, melewati sel kosong sampai baris kepala terakhir.
Contohnya C1 "Realisasi" + C2 kosong → C1:C2. Sel yang berisi teks tidak pernah tertelan.
Ini yang membuat kepala 2–3 baris rapi dengan satu klik, tanpa menggabung kolom satu per satu.

### 4.6 Kolom ditambah, dipindah, dihapus di daftar

- Sel kepala ikut kolomnya (sudah begitu lewat `asal`, `kepalaBaru`).
- Gabungan yang terpotong karena perpindahan **terlihat langsung di kisi**. Petunjuk teks "periksa lagi sesudahnya" yang ada sekarang tidak lagi diperlukan.
- Rumus kolom (`=C-D`) ikut huruf barunya (T4). Hapus kolom yang dirujuk menjadi `#REF!`, dan tombol Masukkan ditahan.
- Kolom baru: judulnya ditaruh di sel miliknya (§4.2).

### 4.7 Yang tetap

- `judulIkutSetelan` tetap jalan: judul yang masih sama dengan label lama sumber ikut berganti, dan kini menulis ke sel milik kolom.
- Tabel kosong yang dihubungkan: kepala bawaan 1 baris berisi judul kolom sumber.
- Templat boleh membawa kepala bertingkat (Tahap B, mis. "Capaian Kinerja": Target | Realisasi | Capaian dengan sub-kolom).

## 5. Bagian B — Editor tabel ala Excel

### 5.1 Memilih

- **Klik-seret** memblok. Shift+klik dan **Shift+panah** memperluas blok.
- **Bilah huruf kolom (A B C)** dan **nomor baris** bisa diklik untuk memilih seluruh kolom/baris; diseret untuk beberapa sekaligus. Sudut kiri-atas memilih semua; Ctrl+A juga.
- Blok yang menyentuh sebagian sel gabungan **diluaskan** sampai menutup gabungannya (cara Excel). Tanpa itu, Gabung/Hapus bisa memotong gabungan di tengah.
- Bilah huruf kolom **menggantikan baris nama kolom** (E1/E2). Baris itu dulu berisi isian, pilihan perataan, dan ×.

### 5.2 Bergerak & mengetik

| Tombol | Hasil |
|---|---|
| Panah | Pindah sel (melompati sel tersembunyi gabungan) |
| Tab / Shift+Tab | Ke kanan / ke kiri |
| Enter / Shift+Enter | Ke bawah / ke atas (sesudah menyunting: simpan lalu turun) |
| Langsung mengetik | Menimpa isi sel terpilih |
| F2 / dobel-klik | Menyunting tanpa menimpa |
| Esc | **Membatalkan** suntingan (T7) |
| Home / End, Ctrl+Home / Ctrl+End | Awal/akhir baris, awal/akhir tabel |
| Ctrl+panah | Lompat ke tepi data |

### 5.3 Menghapus

- **Delete / Backspace** mengosongkan isi seluruh blok. Formatnya tetap, sama seperti Excel.
- **Hapus format** (bilah alat & menu klik-kanan) mengembalikan sel ke polos.
- Blok berisi sel gabungan: isinya dikosongkan, gabungannya tetap.

### 5.4 Baris & kolom

- **Sisip** baris di atas/bawah, kolom di kiri/kanan. Jumlahnya **sebanyak yang dipilih** (blok 3 baris → sisip 3).
- **Hapus** baris/kolom yang dipilih sekaligus. Tersedia lewat tombol "Sisip ▾" dan "Hapus ▾" di bilah alat, menu klik-kanan,
  serta Ctrl+− dan Ctrl+Shift+= (pintasan Excel).
- × per baris dan × per kolom dihapus. Penggantinya pilih lalu Hapus.
- Gabungan **menyesuaikan**:
  - sisip di dalam gabungan → gabungan memanjang;
  - hapus sebagian baris/kolom gabungan → gabungan memendek;
  - baris asal gabungan dihapus → teksnya pindah ke asal yang baru. Ini lebih ramah dari Excel, yang membuangnya.
- Sisip/hapus di wilayah kepala mengubah jumlah baris kepala (maks 3).
- Batas tetap 12 kolom (`BATAS_KOLOM`) dan 500 baris.
- Rumus ikut bergeser (E6).

### 5.5 Lebar kolom

- Pegangan di **setiap garis** antar-huruf kolom. Saat diseret, muncul keterangan lebar dalam **cm** (ukuran kertas, bukan px).
- **Dobel-klik garis** = paskan ke isi terpanjang (cara Excel).
- **Garis batas kertas** putus-putus di editor pada 15,5 cm. Bila tabel melewatinya, muncul tombol **"Paskan ke lebar kertas"** yang menyusutkan semua kolom sebanding.
- **Word**: tabel yang lebih lebar dari bidang tulis disusutkan sebanding (T3). Usulan: otomatis di `docgen.ts`, supaya dokumen lama yang sudah terlanjur lebar ikut beres.

### 5.6 Salin, potong, tempel

- Ctrl+C selalu menyalin blok, termasuk satu sel (sekarang hanya blok > 1 sel).
- **Ctrl+X**: salin lalu langsung kosongkan blok (Excel menunggu sampai ditempel; ini lebih sederhana, dan Ctrl+Z tetap mengembalikannya).
- **Ctrl+Shift+V = tempel nilai saja**, tanpa format.
- Tempelan lebih lebar dari tabel → ditawari tambah kolom sampai batas 12, sisanya **disebut** (T6).
- Tahap C: tempel dari Excel **lengkap dengan gabungan & tebal** (membaca `text/html` clipboard).

### 5.7 Isi-seret (fill handle)

Kotak kecil di sudut kanan-bawah blok, seret ke bawah/kanan:

- Angka berpola (1, 2 → 3, 4 …), bulan (Jan, Feb …), triwulan (TW I … TW IV), dan teks berakhiran angka ("Sasaran 1" → "Sasaran 2").
- Selain itu disalin apa adanya.
- Rumus disalin dengan **rujukan relatif** (`=B2*C2` → `=B3*C3`). Rujukan `$B$2` tidak ikut bergeser, sehingga evaluator perlu mengenali `$`.

### 5.8 Format tambahan

- Pintasan Ctrl+B (tebal), Ctrl+I (**miring**, baru), dan Ctrl+U (**garis bawah**, baru).
- **Warna huruf** (palet kecil seperti Latar).
- **Kuas format**: salin format blok, lalu tempel ke blok berikutnya.
- Teks panjang di editor tampil **terbungkus seperti di Word**. Sekarang teks itu satu baris yang terpotong, sementara Word membungkusnya.
- **Alt+Enter** = baris baru di dalam sel → `<w:br/>` di Word.

### 5.9 Rumus & angka

- T1: rumus membaca angka gaya Indonesia lewat `angkaTeksId`.
- T2: hasil rumus tanpa format ditulis gaya Indonesia ("1.250.000,5").
- **Σ AutoSum**: menjumlahkan deret angka bersambung di atas sel terpilih (atau di kirinya).
- **Bilah status** di bawah tabel untuk blok terpilih: *Jumlah · Rata-rata · Banyak* (memakai `angkaSel`). Gunanya mencocokkan angka tanpa menulis rumus.

### 5.10 Menu klik-kanan

Semua aksi di satu tempat: Potong · Salin · Tempel · Tempel nilai · Sisip baris atas/bawah ·
Sisip kolom kiri/kanan · Hapus baris · Hapus kolom · Kosongkan · Gabung · Pisah · Hapus format.
Aksi yang tidak berlaku (tertaut, batas 12 kolom) tampil mati beserta alasannya, bukan disembunyikan.

### 5.11 Lain-lain

- Kepala tabel & bilah huruf **tetap terlihat** saat tabel panjang digulir.
- Semua aksi baru masuk riwayat urungkan (`pushHist`), satu aksi = satu langkah.

## 6. Tabel tertaut — perilaku tiap fitur

| Fitur | Kepala | Badan |
|---|---|---|
| Pilih, seret, salin, bilah status | ✓ | ✓ |
| Ketik, Delete, tempel, isi-seret | ✓ | Hanya kolom **isian tangan**. Rumus ditolak di sana (sudah begitu) |
| Format, gabung, hapus format | ✓ | ✗ — tertimpa tiap Perbarui (K6) |
| Sisip/hapus baris | ✓ (jumlah kepala berubah) | ✗ — mengikuti sumber |
| Sisip/hapus/pindah kolom | ✗ di editor → lewat **Atur Bentuk** | ✗ |
| Lebar kolom, paskan | ✓ | ✓ (tata letak saja, resep tidak berubah) |

Aksi yang ditolak di badan muncul sebagai toast satu kalimat yang menyebut jalan keluarnya: Atur Bentuk atau Lepas Tautan.

## 7. Berkas yang disentuh

| Berkas | Isi |
|---|---|
| `lib/lkjip/tabel.ts` | Fungsi murni baru: `selMilikKolom`, `luaskanPilihan`, `sisipBaris/hapusBaris/sisipKolom/hapusKolom` (gabungan menyesuaikan), `geserRujukan` (sel & kolom), `kosongkanBlok`, `rapikanKepala`, `isiSeret`; T1/T2; `$` di evaluator |
| `lib/lkjip/tautan.ts` | `kepalaBaru`/rumus kolom memakai `geserRujukan` (T4) |
| `app/(dashboard)/lkjip/[id]/` | `TabelEditor` dipisah dari `editor-client.tsx` (berkasnya sudah 1.811 baris) · hook `usePilihanSel` dipakai editor & kisi modal · `KisiKepala.tsx` di `TautanModal` |
| `lib/lkjip/docgen.ts` | Sel galat → "—", susut ke lebar kertas, Tahap B: miring/garis bawah/warna huruf + `<w:br/>` |
| `lib/lkjip/schemas.ts` | `CellSchema`: `i`, `u`, `fc` (Tahap B) |
| `lib/lkjip/kesegaran.ts` / Finalisasi | Menyebut sel galat (E7) |

## 8. Tahapan

| Tahap | Isi | Kenapa urutannya begini |
|---|---|---|
| **A** (yang diminta) | §4 kisi kepala di modal · E1–E3 · §5.1–5.5 · E6/E7 · T1–T7 · **W1–W2** (§12.1) | Inti permintaan + cacat yang bisa membuat angka di dokumen resmi salah atau tercetak berantakan |
| **W** (ala Word) | §12.2–12.4 | Yang dibaca atasan adalah Word-nya. Usulan: dikerjakan **sebelum B** |
| **B** (ala Excel tambahan) | §5.6–5.11, templat berkepala bertingkat | Mempercepat kerja, tidak mengubah benar/salahnya dokumen |
| **C** (nanti) | Tempel dari Excel lengkap dgn gabungan · Urutkan blok · Cari & ganti di tabel · **§12.5** nomor per BAB + rujukan silang | Paling mahal dan paling jarang dipakai; §12.5 menyentuh seluruh dokumen, bukan satu tabel |

## 9. Sengaja tidak dibuat

- **Tinggi baris manual**: Word menentukan tinggi baris dari isinya.
- **Bekukan kolom, filter, format bersyarat, banyak lembar, komentar sel**: tabel ini bagian dokumen Word, bukan lembar kerja.
- **Fungsi lanjut** (VLOOKUP, dsb.): angka antartabel/modul sudah lewat tabel tertaut.
- **Lebih dari 3 baris kepala**: belum pernah dibutuhkan, dan 3 sudah menampung kepala bertingkat dua lapis plus judul.
- **Fitur Word yang tidak dibawa** (§12.6): lacak perubahan & komentar, tabel bersarang, garis diagonal, garis ganda/putus-putus, teks mengalir di sekitar tabel, pisah/gabung tabel.

## 10. Uji

- `scripts/test-lkjip-tabel-excel.mts` (baru), fungsi murni dengan data yang sengaja sulit:
  - gabungan terpotong sisip/hapus di tepi dan di tengah;
  - rumus `A1:A10` saat baris 5 dihapus → `A1:A9`, rujukan ke yang dihapus → `#REF!`;
  - sel milik kolom untuk tiga keadaan di §4.2;
  - gabung yang menurunkan judul;
  - Rapikan tidak menelan sel berisi;
  - isi-seret deret + rumus relatif/absolut;
  - T1 ("1.250.000" + "7,5");
  - susut lebar di Word (dxa total ≤ 8.788);
  - bolak-balik `CellSchema` untuk field baru.
- Uji mutasi untuk tiap aturan di atas. Suite tertaut (152) & angka (62) harus tetap hijau.
- Di peramban (tahun kotak pasir):
  - susun gambar acuan **dari modal saja** → Masukkan → editor sama → unduh Word dan buka → sama;
  - seret-blok, Delete, hapus 3 baris sekaligus, seret lebar di tiap garis, tabel 8 kolom dipaskan;
  - tabel tertaut menolak sunting badan;
  - tema terang/gelap, 375 px.

## 11. Keputusan yang sudah diambil (bisa dibatalkan pemilik sebelum eksekusi)

1. Pilihan "Header: kolom" dihapus. Tabel lama tetap tercetak sama (E1).
2. Jumlah baris kepala menyisip/membuang baris, tidak meminjam baris data (E3).
3. Sel galat dicetak "—" di Word (E7).
4. Tabel yang lebih lebar dari kertas disusutkan otomatis di Word (§5.5).
5. Ctrl+X langsung mengosongkan, tidak menunggu ditempel (§5.6).
6. Baris asal gabungan yang dihapus: teksnya dipindah, bukan dibuang (§5.4).
7. Baris tabel tidak boleh terpotong antarhalaman, dan ini berlaku untuk **semua** tabel termasuk yang lama. Word yang diunduh ulang bisa bergeser sedikit (W2).
8. Gaya tabel dihitung saat tabel digambar, tidak ditulis ke sel. Karena itu tabel tertaut ikut bisa diberi gaya walau badannya terkunci (§12.3).

## 12. Ala Word (susulan 2026-10-18)

Dibaca dari `lib/lkjip/docgen.ts`. Yang **sudah ada** di Word dan tidak dibangun ulang:

- kepala tabel diulang di tiap halaman (`<w:tblHeader/>`, baris 260/264);
- Daftar Tabel otomatis (judul ber-`SEQ` + `TOC \c "Tabel"`);
- Word menyegarkan nomor saat dibuka (`updateFields`, baris 507);
- huruf tabel mengikuti dokumen, dan warna kepala diambil dari Pengaturan Dokumen.

### 12.1 Dua cacat cetak (masuk Tahap A)

Dibuktikan dari kode saja, **belum dicoba di Word**:

- **W1. Judul tabel bisa tertinggal sendirian di dasar halaman.**
  - Penyebab: gaya `Caption` (baris 407–408) tidak memakai `keepNext`, padahal gaya Heading memakainya (baris 392). Akibatnya "Tabel 7 Capaian …" bisa jatuh di halaman 12 sementara tabelnya mulai di halaman 13.
  - Perbaikan: tambahkan `keepNext` ke gaya `Caption`, satu baris. Gambar dan Grafik ikut beres.
- **W2. Satu baris tabel bisa terbelah dua halaman.**
  - Penyebab: `cantSplit` hanya dipasang di baris kepala (baris 260). Baris badan berteks panjang bisa terbagi: separuh di halaman ini, separuh di halaman berikutnya.
  - Perbaikan: `cantSplit` dipasang di semua baris. Keputusan #7.

### 12.2 Tata letak di kertas

- **Halaman melintang per tabel.**
  - Aturan: centang "Cetak melintang" di tabel itu. Word membuatkan tabel itu section melintang sendiri, lalu halaman sesudahnya kembali tegak.
  - Lebar bidang tulis: 16.839 − 1.701 − 1.418 = **13.720 dxa (± 24,2 cm)**, dibanding 15,5 cm di halaman tegak.
  - Penawar T3 yang sesungguhnya: menyusutkan 8 kolom ke 15,5 cm menghasilkan kolom ± 1,9 cm. Di halaman melintang lebarnya ± 3 cm.
  - Di editor, garis batas kertas ikut pindah ke 24,2 cm, dan "Paskan ke lebar kertas" memakai lebar itu.
  - Bagian paling mudah salah adalah **nomor halaman**. Sekarang `start=1` menempel di `sectPr` penutup isi. Begitu ada section di tengah, `start=1` wajib pindah ke section isi yang **pertama**, dan section berikutnya tanpa `start`. Kalau tidak, nomor halaman mulai lagi dari 1 sesudah tabel melintang.
- **Posisi tabel**: tengah (sekarang selalu begitu, `<w:jc w:val="center"/>`), kiri, atau selebar kertas.
- **Ratakan lebar kolom terpilih** (*Distribute Columns* di Word): kolom yang dipilih dibuat sama lebar dengan jumlah lebar yang tetap.
- **Jaga tabel kecil tetap utuh**: centang per tabel. Caranya cara Word sendiri, yaitu `keepNext` di semua baris kecuali baris terakhir. Bawaannya mati.

### 12.3 Gaya & isi

- **Gaya tabel siap pakai.** Field payload `gaya`, beberapa centang yang bisa digabung:
  - baris berselang (latar muda selang-seling);
  - baris terakhir = JUMLAH (tebal + garis atas tebal);
  - garis mendatar saja (tanpa garis tegak, gaya laporan modern).

  Dihitung saat menggambar oleh **satu** fungsi murni `gayaSel(r, c)` yang dipakai editor dan `docgen.ts`. Format sel sendiri menang atas gaya. Karena tidak ditulis ke sel, gaya **tidak tertimpa Perbarui**. Ini satu-satunya jalan merapikan tabel tertaut, yang badannya terkunci untuk format (§6).
- **Baris "Sumber:" di bawah tabel.**
  - Contoh: "Sumber: Bagian Keuangan, 2026" ditulis kecil miring rata kiri di bawah tabel, lazim di LKJIP.
  - Isinya diketik pemakai. Keterangan tautan tetap tidak dicetak otomatis, sesuai keputusan pemilik di konsep tertaut.
  - Supaya tidak lepas dari tabel, baris terakhir tabel diberi `keepNext`.
- **Teks tegak di sel**, untuk kepala kolom sempit seperti "TW I" atau "Satuan". Field sel `rot` → `<w:textDirection w:val="btLr"/>`; di editor memakai `writing-mode`. Tinggi baris otomatis di Word **perlu dibuktikan**.
- **Kolom No. otomatis.**
  - Satu kolom ditandai `kolomNomor`. Nomornya diurut ulang sendiri saat baris disisip, dihapus, atau diurutkan.
  - Yang dilewati: baris kepala, dan baris yang sel No.-nya bagian gabungan mendatar (baris judul kelompok).
  - `kolomNomor` ikut bergeser saat kolom disisip atau dihapus, sama seperti `align`/`colWidths`.
  - Tabel tertaut sudah punya Nomor urut sendiri, jadi tidak berlaku di sana.

### 12.4 Cara kerja ala Word di editor

- **Tab di sel terakhir menambah baris baru** (cara Word). Tidak berlaku di badan tabel tertaut.
- **Nomor tabel tampil di editor** ("Tabel 7 · Capaian …"). Sekarang editor tidak menyebut nomor sama sekali; pemilih tabel di blok grafik cuma menulis `Tabel ${i + 1}` sebagai cadangan judul.
  - Nomor dihitung satu fungsi bersama di `numbering.ts`. Fungsi yang sama mengisi angka cache field `SEQ`, yang sekarang selalu `'1'` (baris 207).
  - Gunanya: penampil yang tidak menyegarkan field tidak menulis "Tabel 1" di semua tabel. Contohnya pratinjau Drive/ponsel, tapi ini **belum dicoba**.
- **Salin ke Word/Excel lengkap dengan gabungan.** Ctrl+C mengisi papan klip dengan TSV (seperti sekarang) **dan** `text/html` `<table>` ber-`colspan`/`rowspan`/tebal/latar. Kebalikan dari tempel HTML di Tahap C, dan jauh lebih murah.

### 12.5 Tahap C — menyentuh seluruh dokumen

- **Nomor per BAB ("Tabel 3.1")**, opsi di Pengaturan Dokumen (`style_config`, wajib didaftarkan di skemanya).
  - Di Word: awalan BAB ditulis dari pohon, lalu `SEQ Tabel \s 1` yang mulai ulang di tiap Heading 1. Perilaku `\s` pada heading tanpa penomoran daftar Word **perlu dibuktikan**.
  - Gambar dan Grafik ikut, sebab fungsi judulnya satu.
- **Rujukan silang di narasi** ("lihat Tabel 3.1"). Node atom seperti `angkaTaut`: `<span data-rujuk="…">`, teksnya dihitung ulang dari nomor tabel.
  - Tabel yang dihapus → "Tabel ?", dan disebut oleh Periksa/Finalisasi.
  - Wajib ikut `sanitizeNarasiHtml`.
  - Wajib ikut pemetaan blok saat **Pulihkan versi**. Itu cacat yang pernah memutus grafik dari tabelnya (`petakanRujukanGrafik`), dan rujukan silang akan kena dengan cara yang persis sama.

### 12.6 Fitur Word yang tidak dibawa

- **Lacak perubahan & komentar**: riwayat versi dokumen sudah ada, dan komentar sel sudah dikecualikan di §9.
- **Tabel bersarang, garis diagonal, garis ganda/putus-putus, teks mengalir di sekitar tabel**: jarang di dokumen pemerintah, dan semuanya harus bisa digambar juga di editor.
- **Pisah/gabung tabel**: kepala sudah diulang di tiap halaman, jadi tabel panjang tidak perlu dipecah.

### 12.7 Berkas & uji tambahan

| Berkas | Isi |
|---|---|
| `lib/lkjip/docgen.ts` | W1/W2 · section melintang + nomor halaman bersambung · posisi · `gayaSel` · baris Sumber · `textDirection` · cache `SEQ` |
| `lib/lkjip/tabel.ts` | `gayaSel`, `nomorUlang` (kolom No.), `ratakanLebar` |
| `lib/lkjip/numbering.ts` | nomor Tabel/Gambar/Grafik, satu fungsi untuk editor & Word |
| `lib/lkjip/schemas.ts` | `TabelPayloadSchema`: `melintang`, `posisi`, `gaya`, `sumber`, `utuh`, `kolomNomor` · `CellSchema`: `rot` (Zod membuang kunci tak dikenal) |

Uji (`test-lkjip-tabel-excel.mts`), memeriksa XML Word yang dibangun sungguhan:

- `Caption` ber-`keepNext`; semua baris ber-`cantSplit`;
- dokumen dengan tabel melintang di tengah: `start=1` hanya di section isi pertama, dan `pgSz` tertukar + `orient="landscape"`;
- format sel menang atas `gayaSel`; gaya bertahan sesudah Perbarui;
- kolom No. melewati baris judul kelompok;
- nomor tabel editor = cache `SEQ` di Word.

Di peramban dan Word, dokumen dengan satu tabel melintang di tengah BAB III dibuka di Word. Yang diperiksa: nomor halaman bersambung, Daftar Tabel benar, dan judul tidak terpisah dari tabelnya.

## 13. Pelaksanaan Tahap A (2026-10-18)

Berkas:

- `lib/lkjip/tabel.ts`: T1/T2, `#REF!`, dan semua aturan ala Excel (fungsi murni).
- `TabelEditor.tsx`: dipisah dari `editor-client.tsx`.
- `usePilihanSel.ts`: satu hook pilihan untuk editor dan kisi modal.
- `KisiKepala.tsx`: kisi kepala di modal.
- `TautanModal.tsx`: kolom + kisi kepala + letak judul dalam satu state.
- `docgen.ts`: W1, W2, T3, E7.
- `kesegaran.ts`: `kumpulkanSelGalat` untuk Finalisasi.

Nol tabel, kolom, migrasi, maupun endpoint.

### Yang berubah dari konsep saat dikerjakan

- **W1 tidak lewat gaya `Caption`.** Judul gambar dan grafik ada di BAWAH gambarnya, jadi `keepNext` di gaya akan mengikat judul itu ke paragraf sesudahnya.
  - Judul **tabel** diberi `keepNext` sendiri.
  - Untuk gambar dan grafik, yang diikat paragraf **gambarnya**, ke judul di bawahnya.
- **Papan ketik ditangkap textarea tersembunyi** berisi TSV blok terpilih. Alasannya dua:
  - Ctrl+C bawaan peramban langsung menyalin tanpa izin clipboard. Server kantor diakses lewat http, dan `navigator.clipboard` tidak tersedia di sana.
  - Ctrl+V tiba di `onPaste`.
- **Mengetik juga dimulai dari event `input`**, bukan hanya `keydown`. Ditemukan saat diuji: teks yang masuk tanpa `keydown` diabaikan. Contohnya IME, papan ketik ponsel, dan alat bantu.
- **Ketikan di sel berformat angka disimpan sebagai angka mesin** (`nilaiKetikan`). Ini cacat sepupu T1: "1.250.000" di sel Rupiah dulu tampil "Rp 1".
- **Kolom rumus tabel tertaut** tidak lagi mem-parse teks tampil (`nilaiRumus`). Kalau tetap mem-parse, T2 akan membuat `Number("1.250.000,5")` = NaN, dan semua kolom rumus tertaut berubah jadi "—".
- **Tukar kolom di modal** (`tukarKolomSel`) hanya memisah gabungan yang menyentuh SATU dari dua kolom yang ditukar; gabungan yang menutup keduanya tetap utuh. Tanpa itu gabungannya ikut tertukar setengah.

### Uji

- `npx tsx scripts/test-lkjip-tabel-excel.mts`: **90 pemeriksaan**, **34 uji mutasi tertangkap**.
  - Satu mutasi sempat LOLOS. Pemeriksaan G17 menerima galat apa pun, padahal `#REF!` tanpa pagar khususnya tetap ditolak sebagai "tanda # tidak dikenal". Kini G17 memeriksa kalimat "sudah dihapus".
- Suite tertaut (156), angka (62), dan bab-wajib (57) tetap hijau.
  - Pemeriksaan K1–K9/L12 dan E14 dipindah ke `TabelEditor.tsx` dan bentuk modal baru, dengan maksud yang sama.
- Peramban, dokumen kotak pasir 2099 (dibersihkan sesudahnya):
  - mengetik/Tab/Enter, sisip baris di bawah, rumus `=SUM` "1.250.000" + "7,5" = **1.250.007,5**;
  - Ctrl+− menghapus baris, dan rumusnya ikut jadi `=SUM(B2:B2)`;
  - Esc, seret-blok + Delete, Ctrl+Z;
  - seret lebar memunculkan peringatan 18,7 cm, "Paskan ke lebar kertas", dobel-klik paskan isi;
  - "Kepala: 2 baris" menyisip di atas badan.
  - Di modal, kisi kepala menyusun gambar acuan: gabung menurunkan judul, Rapikan ↓, Pisah lengket. Lalu Masukkan → editor → Word.
  - Word dibangkitkan dari isi tersimpan dan XML-nya dibaca: `keepNext`, `tblHeader` 2 baris, `cantSplit`, `gridSpan`/`vMerge`.
  - Tema terang dicek.

### Belum diverifikasi

- Berkas **belum dibuka di Microsoft Word**; yang diperiksa baru XML-nya.
- Lebar ponsel 375 px belum dicek.
- Tarik data dengan baris sungguhan belum dicoba, karena sumber 2099 kosong.
