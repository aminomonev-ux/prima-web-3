# Format Unduhan Excel & PDF — DPA, Pergeseran, Rekap PJ

> Status: **DIEKSEKUSI** 2026-11-25. Gaya dipilih pemilik: **C — tata letak A dengan warna B**
> (§5a); baris nomor kolom dipakai + Impor diajari (§6.1); PJ dobel ditandai di tabel (§6.2).
> Catatan pengerjaan & temuan: §9.
> Contoh berkas: `docs/referensi/contoh-cetak-blud/` (lokal saja, tidak ikut repo) —
> dibuat dari DPA 2026 versi 29 Agu & Pergeseran 2 Sep (hanya dibaca). **Isian Penanggung
> Jawab di contoh itu FIKTIF**: DB laptop pengembang tidak punya isian PJ, jadi labelnya
> ditempel di memori ke baris tingkat 4 supaya Rekap PJ punya isi.

## 1. Masalahnya

Unduhan menu Cetak BLUD lahir dari dua jalur dengan mutu berbeda:

| Unduhan | Excel | PDF |
|---|---|---|
| DPA / DPA Perubahan / Pergeseran | `dpa-dokumen.ts` — sudah ber-kop, berumus, ada tanda tangan | `pdf.ts` generik — tabel polos biru, tanpa kop resmi, tanpa hierarki, tanpa tanda tangan |
| Rekap PJ (DPA & pasca-geser) | `excel.ts` generik | `pdf.ts` generik |
| Daftar Perpindahan, Pergeseran tersaring | `excel.ts` generik | `pdf.ts` generik |

Yang membuat Rekap PJ (gambar keluhan) terlihat jelek, semuanya dari `excel.ts`:

- **Tanpa kop.** Baris 1 langsung kepala tabel; judul dokumen, instansi, tahun, dan versi
  sumbernya tidak tertulis di berkas sama sekali.
- **Pengelompokan hilang.** Di layar, baris PJ berwarna ungu dan total berwarna amber.
  Di Excel semua baris sama: nama PJ tercampur di kolom yang sama dengan isi, lalu
  terpotong ("enanggung Jawa") karena kolomnya 14 karakter.
- **Total ganda.** "TOTAL BELANJA BLUD" ditulis di atas DAN di bawah, dan tiap PJ ditulis dua
  kali ("Kasubbag Perbendaharaan" lalu "Kasubbag Perbendaharaan Total").
- **Tidak siap cetak.** Tanpa ukuran kertas, kepala tidak berulang di halaman berikutnya,
  tanpa nomor halaman, garis kisi Excel ikut tampil.

PDF DPA & Pergeseran punya cacat yang sama ditambah satu yang lebih berat: **hierarki rata**.
558 baris tampil sejajar tanpa beda tebal atau menjorok, jadi pembaca tidak bisa membedakan
rekening induk dari rinciannya.

## 2. Yang tidak boleh berubah

Ini batas yang menjaga fitur yang sudah ada (cari dulu pemakainya sebelum menyentuh):

1. **Excel DPA/Pergeseran tetap berumus**: daun `ROUND(vol*harga,0)`, induk `SUM(anak)`
   (`dpa-dokumen.ts`). Kolom **Level** & **Jangkar** tetap ada dan tersembunyi. Ini yang
   membuat **Impor** dan **impor-balik** (penanda unduhan di J1) bisa membaca berkasnya.
2. **Kop baris 5** ("DPA PERUBAHAN KE-n · versi …") tetap di tempat yang dibaca Impor
   (`kopPerubahan`). Kalau tata letak kop bergeser, pembaca impor wajib ikut. Uji
   bolak-balik `test-blud-impor-bolak-balik.mts`, `test-blud-impor-balik.mts`, dan
   `test-blud-dpa-perubahan-cetak.mts` WAJIB tetap hijau.
3. **Angka sama dengan layar.** Rekap PJ memakai `kelompokPerPj` + `auditRekapPJ` yang sama
   (subtotal mentah, total bersih dobel). Pemformat tidak boleh menghitung ulang.
4. Hanya tanda tangan **Direktur** (keputusan 2026-08-05), diambil dari `blud_pejabat`.
5. Pergeseran tersaring ("Hanya yang bergeser") tetap **tanpa rumus** (rentang SUM putus).
6. Huruf PDF tetap Helvetica/Courier bawaan jsPDF (gate F `check:pdf`, WinAnsi). Titik tengah
   "·" di PDF diganti "-".

## 3. Yang sama di kedua contoh

- **Kop** di setiap berkas: judul, BLUD, instansi + provinsi, tahun anggaran, lalu baris
  sumber ("DPA BLUD versi 29 Agu 2026 · 558 baris").
- **Hierarki terlihat**: tingkat 1 huruf kapital + tebal, tingkat 2–3 tebal, rincian biasa;
  kolom Uraian menjorok sesuai kedalaman (Excel `alignment.indent`, PDF `cellPadding.left`).
  Kedalaman dihitung dari `parent_id` (pohon), bukan dari `tipe_baris`.
- **Baris JUMLAH** di akhir tabel = jumlah baris AKAR (bukan jumlah semua baris).
- **Siap cetak**: A4 (DPA & Pergeseran mendatar, Rekap PJ tegak), muat selebar kertas, kepala
  tabel berulang di tiap halaman, nomor "Halaman x dari y", garis kisi Excel disembunyikan,
  baris kepala dibekukan.
- **Angka** monospace (Consolas di Excel, Courier di PDF) dengan format `#,##0`; nilai
  negatif/berkurang ditulis dalam kurung.
- **Rekap PJ**: satu total di bawah saja; PJ jadi kepala kelompok berhuruf (A, B, C…) dengan
  subtotal dan **porsi %**; rinciannya bernomor 1, 2, 3; catatan kecil di bawah tabel
  menyebut total DPA vs total rekap vs selisih (dari `auditRekapPJ`, yang selama ini hanya
  muncul di layar).
- **Pergeseran**: Bertambah/Berkurang dari `uraiGeser` (mutasi ikut), plus kalimat
  "Berimbang: bertambah Rp … = berkurang Rp …" di bawah tabel. Contoh memakai judul
  "Semula/Menjadi"; saat dikerjakan judul kolom yang sudah ada (`Jumlah`, `Vol P`, `Harga P`,
  `Pergeseran`) DIPERTAHANKAN — `Vol P` + `Harga P` penanda tolak Impor DPA (§6.1 butir 3).
- **PDF punya tanda tangan Direktur** seperti Excel (saat ini PDF tidak punya).

## 4. Contoh A — "Resmi"

Hitam-putih, gaya dokumen anggaran pemerintah. Cocok untuk dicetak di printer kantor
(laser hitam-putih) dan ditandatangani.

- Kop rata tengah, garis ganda di bawahnya.
- Kepala tabel abu-abu muda + **baris nomor kolom** `(1) (2) (3)…` di bawahnya.
- Tingkat 1 berlatar abu-abu sangat muda, sisanya putih; garis tegak per kolom, garis
  mendatar tipis.
- Rekap PJ: kepala kelompok abu-abu, lalu baris "Jumlah A/B/C" bergaris atas, dan
  **JUMLAH SELURUHNYA** bergaris ganda.
- Bertambah/Berkurang tanpa warna (berkurang dalam kurung) — tetap terbaca di cetakan
  hitam-putih.

Berkas: `Contoh-A-Resmi.xlsx` (lembar DPA, Pergeseran, Rekap PJ), `Contoh-A-DPA.pdf`,
`Contoh-A-Pergeseran.pdf`, `Contoh-A-RekapPJ.pdf`.

## 5. Contoh B — "Modern"

Warna PRIMA (navy `#042C53` + amber `#EF9F27`). Enak dibaca di layar dan dibagikan sebagai
berkas.

- Pita judul navy di atas dengan garis amber; baris sumber berwarna amber muda.
- **Kartu ringkasan** di PDF (Total belanja · jumlah rekening · jumlah PJ · versi; untuk
  Pergeseran: Semula · Menjadi · Digeser · Rekening bergeser).
- Tingkat 1 navy dengan teks putih, tingkat 2–3 biru muda bertingkat, rincian putih bergaris
  tipis.
- Pergeseran: Bertambah hijau `#1D9E75`, Berkurang merah `#E24B4A`; rincian yang bergeser
  diberi tanda tepi kiri amber.
- Rekap PJ: **tabel Ringkasan** di depan (satu baris per PJ + batang porsi; di Excel lewat
  *data bar*), lalu rincian per PJ dengan kepala kelompok krem bertanda tepi amber; TOTAL
  berlatar amber.
- Kekurangannya: kalau dicetak hitam-putih, latar navy jadi blok hitam pekat dan tinta
  boros.

Berkas: `Contoh-B-Modern.xlsx`, `Contoh-B-DPA.pdf`, `Contoh-B-Pergeseran.pdf`,
`Contoh-B-RekapPJ.pdf`.

## 5a. Pilihan: Contoh C — "Resmi berwarna" (A + warna B)

Keputusan pemilik 2026-11-25: susunan A dipertahankan utuh, warnanya diambil dari B.

| Bagian | Susunan (dari A) | Warna (dari B) |
|---|---|---|
| Kop | rata tengah, 4 baris + baris sumber | teks navy `#042C53`, sumber abu-biru; garis ganda navy + garis amber `#EF9F27` di bawahnya |
| Kepala tabel | + baris nomor kolom `(1)(2)…` | navy, teks putih; baris nomor kolom biru muda `#DCE8F5`, miring navy |
| Tingkat 1 | huruf kapital, tebal | latar navy, teks putih |
| Tingkat 2 / 3 | tebal, menjorok | biru muda `#DCE8F5` / `#EEF4FA` |
| Rincian | garis tegak per kolom | garis abu-biru tipis (`#B7C4D1` tegak, `#D0D7DE` mendatar) |
| Bertambah / Berkurang | Berkurang dalam kurung | hijau `#1D9E75` / merah `#E24B4A`; rincian yang bergeser bertanda tepi kiri amber |
| Rekap PJ — kelompok | A/B/C + porsi %, "Jumlah A" | kelompok krem `#FDF1DE` + tepi amber; "Jumlah A" krem pucat bergaris atas amber |
| Total | JUMLAH SELURUHNYA / JUMLAH BELANJA, garis atas ganda | latar amber, teks navy |
| Kaki & tanda tangan | Direktur, "Halaman x dari y" | nama instansi navy; garis amber di atas kaki halaman PDF |

Semua warna di atas adalah token DESIGN-SYSTEM (`primary`, `surface-card`, `action-success`,
`action-danger`) atau tint-nya. Di tingkat 1 latar navy hanya mengenai 1 baris per dokumen
(BELANJA DAERAH), jadi boros tinta waktu dicetak hitam-putih tidak jadi masalah.

Berkas: `Contoh-C-Resmi-Berwarna.xlsx`, `Contoh-C-DPA.pdf`, `Contoh-C-Pergeseran.pdf`,
`Contoh-C-RekapPJ.pdf`.

## 6. Yang perlu diputuskan

1. ~~**Gaya mana**~~ — **diputuskan: C** (§5a).
2. ~~**Baris nomor kolom (1)(2)…** di Excel~~ — **diputuskan: dipakai, dan Impor diajari
   melewatinya** (§6.1).
3. ~~**Rekap PJ berisi PJ ganda dalam satu rantai**~~ — **diputuskan: ditandai langsung di
   tabel** (§6.2).

### 6.1 Rumus & Impor tetap utuh — yang wajib ikut diubah

Rumus Excel DPA/Pergeseran **tidak rusak**: `rumusDaun`/`rumusAgregat` menunjuk baris lewat
peta `barisExcel` yang dihitung dari baris data pertama (`siapkanPohon(rows, barisAwal)`).
Kop 6 baris + kepala + nomor kolom cukup menggeser `BARIS_HEADER`/`BARIS_DATA_1`; tiap
`ROUND(C×E)` dan `SUM(anak)` tetap menunjuk baris yang benar. Yang benar-benar perlu
dijaga ada empat, semuanya di pembaca impor (`lib/blud/import-dpa-grid.ts`,
`import-dpa.ts`) dan uji:

1. **Baris nomor kolom** tepat di bawah kepala: dilewati bila SEMUA sel berisinya berbentuk
   `(n)` atau `n` dan berurutan 1, 2, 3… Bentuknya sengaja dibuat ketat supaya baris data
   berkode pendek tidak ikut terbuang. Ini juga menolong formulir kantor yang punya baris
   penomoran 1, 2, 3 (saat ini terbaca sebagai baris data).
2. **Baris JUMLAH BELANJA/JUMLAH** baru di akhir tabel (rumus `SUM` atas baris akar):
   dilewati pembaca. Penandanya Level kosong + Jangkar kosong + uraian `JUMLAH…` + rumus
   SUM yang hanya menunjuk baris akar. Kalau tidak dilewati, ia jadi akar tambahan dan
   totalnya dobel.
3. **Penanda Pergeseran** (`BerkasPergeseranError`, judul `Vol P` + `Harga P`): kalau judul
   kolom berganti jadi "Vol"/"Harga (Rp)" di bawah "Menjadi", penanda wajib ikut diganti,
   supaya Excel Pergeseran tetap ditolak di Impor DPA. Lebih aman: judul kolom Pergeseran
   tetap `Vol P`/`Harga P` (hanya gaya yang berubah).
4. **Kop baris 5** (penanda DPA Perubahan) dan **penanda unduhan** di J1 kolom Jangkar
   tetap di tempatnya. Baris 6 jadi garis amber (tanpa teks).

Bukti yang wajib hijau sesudahnya: `test-blud-dokumen-rumus.mts` (rumus dihitung ulang),
`test-blud-impor-bolak-balik.mts` (558/558 cocok DB), `test-blud-impor-balik.mts`,
`test-blud-dpa-perubahan-cetak.mts` (1.630 rumus Lengkap, 0 meleset), `test-pergeseran-pj.mts`,
`test-blud-urai-geser.mts`. Ditambah: unduhan bergaya baru → impor → sidik baris identik.

### 6.2 PJ ganda ditandai di tabel

Baris yang PJ-nya dobel dengan leluhurnya (`auditRekapPJ.doubleEntries`) tetap tampil
dengan angkanya, tetapi angkanya **miring abu-abu** dan diberi tanda `*` + keterangan
"juga dihitung di [PJ induk]". Catatan kaki: "* tidak dihitung di JUMLAH SELURUHNYA".
Subtotal per PJ tetap MENTAH, sama dengan layar dan nominal BLUD Form PK
(`nominalBludUnit`); yang bersih hanya JUMLAH SELURUHNYA, sesuai yang sudah berlaku.
Tidak ada angka yang berubah, hanya cara menampilkannya.

## 7. Rencana pengerjaan (sesudah dipilih)

1. **Satu modul gaya** `lib/blud/export/gaya-dokumen.ts` (MURNI): warna, huruf, kop, kepala,
   tingkat → gaya, tanda tangan, pengaturan cetak — dipakai Excel DAN PDF supaya keduanya
   tidak berbeda pendapat (pola `warna-delta.ts`).
2. **Excel**: `dpa-dokumen.ts` (DPA, DPA Perubahan Ringkas & Lengkap, Pergeseran, Daftar
   Perpindahan) memakai modul gaya; `excel.ts` dipakai tinggal untuk Master Akun, Rekap PJ
   pindah ke penyusun sendiri (kelompok, subtotal, porsi, catatan audit).
3. **PDF**: `pdf.ts` dipecah per jenis dokumen — DPA, DPA Perubahan, Pergeseran, Rekap PJ,
   Daftar Perpindahan — menerima **baris mentah** (pohon) seperti Excel, bukan `ExportRow`
   yang sudah rata. Jalur generik tinggal untuk Master Akun & pergeseran tersaring.
4. **Uji**: berkas sungguhan (workbook + PDF lewat pdfjs) — kop, kedalaman/indentasi,
   JUMLAH = akar, Rekap PJ total = `auditRekapPJ.grandTotal`, kepala berulang
   (`printTitlesRow`), dan seluruh suite impor/impor-balik/cetak Perubahan tetap hijau.
5. Diperiksa di Excel sungguhan & di cetakan (LibreOffice → PDF) — LibreOffice tidak
   menampilkan indentasi sel ber-wrap, jadi menjorok wajib dilihat di Excel.

Di luar lingkup (bisa menyusul dengan modul gaya yang sama): unduhan Realisasi per PJ
(`realisasi-pj.ts`), SPJ/BKU (`spj-excel.ts`).

## 8. Catatan dari pembuatan contoh

- PDF DPA 558 baris ± 0,9–1,2 MB (Pergeseran lebih besar karena kolomnya lebih banyak).
  Saat dieksekusi ukuran ini perlu diperiksa; kalau mengganggu, gaya per sel dikurangi.
- Kode rekening panjang (`5.2.02.99.99.9999.05.01.004`) butuh kolom ± 25 karakter di Excel
  dan huruf 6,8 pt di PDF supaya tidak patah dua baris.

## 9. Catatan pengerjaan (2026-11-25)

**Berkas**: `lib/blud/export/gaya-dokumen.ts` (SATU gaya Excel + PDF: token warna, kop,
kepala, nomor kolom, tingkat, baris total, tanda tangan, pengaturan cetak) ·
`dpa-dokumen.ts` (DPA, DPA Perubahan Lengkap, Pergeseran, lembar Perpindahan) ·
`rekap-pj-dokumen.ts` (Excel Rekap PJ) · `pdf-dokumen.ts` (PDF DPA, Pergeseran, Rekap PJ
dari baris mentah) · `excel.ts`/`pdf.ts` generik ikut bergaya (Master Akun, Daftar
Perpindahan, DPA Perubahan PDF, Pergeseran tersaring) · `susunRekapPj` di `lib/blud/rekap-pj.ts`
(aturan susunan, dipakai Excel & PDF) · Impor: `adalahBarisNomorKolom` + `barisJumlahPenutup`
di `lib/blud/import-dpa.ts`.

**Tata letak Excel**: kop 1–5 (baris 5 = penanda Perubahan / versi / acuan — dibaca Impor),
garis amber 6, kepala 7 (Lengkap: 7–8), nomor kolom 8 (Lengkap: 9), data mulai 9 (Lengkap: 10),
baris JUMLAH = rumus atas baris AKAR. Judul kolom TIDAK diubah (termasuk `Vol P`/`Harga P`,
penanda tolak Impor DPA); rumus tetap dihitung dari peta letak baris.

**Temuan saat dikerjakan, sudah dibereskan**:
- "Paste as values" membuang rumus baris JUMLAH, jadi pengenalnya tidak boleh mewajibkan
  rumus bila berkas punya kolom Level (Level kosong sudah cukup menandai bukan data).
- Kolom % Rekap PJ berjumlah 114,5% pada data uji ber-PJ dobel: porsi kini dari subtotal
  TANPA baris dobel terhadap total bersih (subtotal yang tampil tetap mentah).
- Harga 13 digit patah dua baris di PDF Pergeseran → kolom angka dilebarkan.
- Hijau/merah gelap tak terbaca di atas latar navy baris akar → di baris akar dipakai versi
  terangnya (`#6EE7B7`/`#FCA5A5`, warna layar gelap).
- Formulir kantor dgn baris "1 2 3" di bawah kepala dulu terbaca sebagai baris data
  berkode "1"; kini dilewati. Formulir kalibrasi 2026 (tanpa baris itu) tetap 558 baris,
  total Rp 68.383.000.000.

**Rekap PJ tanpa satu baris ber-PJ** sekarang ditolak dengan pesan ("Belum ada baris
ber-Penanggung Jawab di versi ini"), dulu terunduh berkas berisi baris total saja.

**Regresi**: `npx tsx scripts/test-blud-format-unduhan.mts` (54; berkas Excel & PDF
sungguhan, PDF dibaca pdfjs), 10 uji mutasi tertangkap. Disesuaikan ke tata letak baru:
`test-dpa-export.mjs`, `test-blud-impor-bolak-balik.mts`, `test-blud-impor-balik.mts`,
`test-blud-dpa-perubahan-cetak.mts`, `test-blud-cetak-perpindahan.mts`,
`test-blud-riwayat-simpan.mts` (G3/G4).
