# Format unduhan seragam — "Resmi berwarna" di semua modul

Status: dikerjakan 2026-11-26 · nol migrasi · nol endpoint baru

## 1. Masalah

Unduhan BLUD (DPA, Pergeseran, Rekap PJ) sudah memakai gaya "Resmi berwarna": kop instansi,
kepala navy, baris nomor kolom (1)(2)…, latar per tingkat, baris JUMLAH amber, catatan, tanda
tangan, dan A4 siap cetak. Modul lain masih menulis Excel/PDF dengan gayanya sendiri-sendiri
(hijau Usulan, kop polos E-Anggaran, lembar tanpa kop Renaksi). Berkas yang diedarkan dari satu
rumah sakit terlihat seperti dari lima aplikasi.

## 2. Keputusan pemilik

| Pertanyaan | Keputusan |
|---|---|
| Cakupan | Semua unduhan Excel & PDF **berbentuk tabel** di semua modul. |
| Yang tidak boleh diubah | Unduhan **Word** & PDF hasil Word (LKJIP, PK) · IKI format BPSDMD · lembar provinsi BBA (KIB A–F, KIR, sensus, Rekap BMD, BI) · SPJ BLUD. Excel Daftar Rencana & format kerja BBA **ikut**. |
| Berkas yang diimpor balik | Pembaca impor harus "pintar": membaca berkas **polos** maupun **berbagai templat**, termasuk unduhan berkop PRIMA sendiri. |
| Tanda tangan | Laporan resmi memakai penanda tangan modulnya; **daftar kerja tanpa tanda tangan**. |
| Satu sumber gaya | Gaya pindah ke `lib/shared/gaya-dokumen.ts`; BLUD membungkusnya. |

## 3. Rancangan

### 3.1 Satu susunan, dua berkas

`lib/shared/tabel-dokumen.ts` mendefinisikan `DokTabel`:
`{ kop, kolom (judul + jenis + lebar), kepala bertingkat?, baris (sel + tingkat/kedalaman/total), catatan?, ttd?, mendatar?, tanpaNomorKolom? }`.

- `tulisTabelExcel(ws, dok, { mulai? })` menulis lembar Excel.
- `gambarTabelPdf(doc, autoTable, dok, opsi)` menggambar PDF. Kaki halaman (`kakiDokPdf`) dipanggil
  pemanggil sekali di akhir berkas.

Modul hanya **menyusun data**. Karena Excel dan PDF dibangun dari dokumen yang sama, keduanya
tidak bisa berbeda isi. Jenis kolom menentukan perataan, huruf mono, dan format angka:

- `rupiah` → `#,##0;(#,##0);"-"`
- `persen` → `0.00` (dalam satuan persen)
- `desimal` → teks PDF berkoma

### 3.2 Tata letak tetap

Baris 1–4 kop, baris 5 keterangan (versi/penanda Perubahan), baris 6 garis amber,
**baris 7 kepala**, lalu baris nomor kolom (kecuali `tanpaNomorKolom`), data, JUMLAH, catatan,
tanda tangan. Panjang kop dan catatan tidak pernah menggeser kepala. Catatan berada di
**bawah** tabel, tidak lagi di kop.

### 3.3 Impor membaca polos maupun berkop

`lib/shared/impor-tabel.ts` (murni):

- `jenisBarisHiasan(sel)` mengenali:
  - `judul`: sel gabung. exceljs memulangkan nilai sel induk di setiap sel anak, jadi teksnya identik di ≥ 2 sel.
  - `nomor`: deret (1)(2)(3)… atau 1 2 3 yang berurutan, minimal 3 sel. Dua sel sudah cukup bila berkurung, untuk tabel Kode | Uraian.
  - `jumlah`: pola sempit "JUMLAH/TOTAL…" diikuti angka. "Jumlah pasien dilayani" **bukan** baris jumlah.
  - `penutup`: catatan dan tanda tangan.
- `cariBarisKepala(grid, cocok)` mencari kepala sambil melewati baris judul.
- `barisDataImpor(grid, cocok)` memulangkan baris sesudah kepala tanpa hiasan. Bila tidak ada kepala, dipakai seluruh lembar.
- `kepalaKodeUraian` mewajibkan kepala menyebut Kode **dan** Uraian. Tanpa syarat itu, baris data yang kebetulan berbunyi "Nama Akun" akan membuang baris di atasnya.

Pembaca yang memakainya:

- E-Anggaran: Rekening, RKO, Master, Laporan, Pendapatan.
- Renaksi: impor dan Matriks Bulanan.
- PK Pejabat.
- BLUD: Master Akun dan Kode Besar.

Impor Master Akun dan Kode Besar sebelumnya **rusak sejak kop BLUD dipasang**: judul kop ikut terbaca sebagai baris data.

## 4. Unduhan yang berpindah

| Modul | Unduhan | Tanda tangan |
|---|---|---|
| E-Anggaran | RKO, Rekening, Realisasi (detail per bulan + Data), Rekap, Laporan, Pendapatan, CRR, Master, bundel | Rekap/Detail/Laporan: Kabag Renbang + Kasubag Program |
| Rencana Aksi | Data Entry (judul kolom tetap untuk Import Renaksi), Cetak gabungan, detail per indikator, Matriks (kolom ID tetap kolom A) | — |
| BLUD | Realisasi per PJ (Rekap + Rincian) | — |
| PK | Excel Master Pejabat (Word tidak disentuh) | — |
| Admin | Tinjauan Akses Berkala | — |
| BBA | Daftar Rencana, format kerja (tanpa nomor kolom, saringan otomatis di baris kepala) | — |
| Usulan | Ringkasan per sub-bidang + satu lembar/halaman per sub-bidang (kepala usulan = induk, subtotal, JUMLAH) | — |

Halaman pemisah hijau di PDF Usulan dibuang. Kop setiap sub-bidang sudah menyebut namanya.

## 5. Akibat yang disengaja

- Rupiah di Excel kini bergaya dokumen anggaran: negatif dalam kurung, nol tertulis "-".
- Hierarki Rekap E-Anggaran dibawa lewat `kedalaman` (indent sel/padding PDF), bukan spasi di teks.
- Kolom PDF yang memuat angka bertipe teks (detail indikator Renaksi) wajib memakai `teksPdf`.
  Tanpa itu angkanya tercetak "7.5", bukan "7,5". Bug ini tertangkap `test-renaksi-desimal`.

## 6. Regresi

- `npx tsx scripts/test-format-unduhan-seragam.mts` (40) mencakup:
  - pengenal hiasan;
  - impor Master Akun dan Kode Besar dari berkas polos, tanpa kepala, dan berkop;
  - bolak-balik unduh → impor E-Anggaran (Rekening, Master, RKO, templat RKO berjudul gabung, Pendapatan);
  - Usulan Excel dan PDF;
  - kerangka bersama.
- 9 uji mutasi dijalankan: 8 tertangkap, 1 setara. Penjaga judul di pencari kepala RKO tidak mengubah perilaku karena pencarinya memilih skor terbaik.
- Uji lama disesuaikan ke tata letak baru (kepala baris 7):
  - `test-kinerja-rekap`, `-versi-cetak`, `-persen`;
  - `test-renaksi-cetak-kolom`, `-impor-tautan`, `-pagu-sumber`, `-desimal`, `-penanda`;
  - `test-blud-realisasi-pj`, `test-bba-kondisi`.
- BLUD tetap identik: `test-blud-format-unduhan` 62/62.
