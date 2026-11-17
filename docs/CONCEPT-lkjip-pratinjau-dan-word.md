# Konsep — Pratinjau Cetak, header/footer, huruf, dan gambar LKJIP

Status: **Tahap 1 & 2 selesai (2026-11-16), Tahap 3 & 4 selesai (2026-11-17)**; Tahap 5 ditunda. Daftar keputusan ada di §8 — pemilik menyetujui semua usulan (D1–D10). Yang beda dari rancangan dicatat di §1.8.

Tujuannya satu: yang dilihat di PRIMA sedekat mungkin dengan yang keluar di Word, dan yang sering diatur di Word bisa diatur di PRIMA. Ada lima tahap. Tiap tahap bisa dipasang sendiri dan tidak memerlukan migrasi database: `style_config` dan isi blok sudah berupa JSON. Tahap 1 butuh LibreOffice terpasang di laptop server.

| Tahap | Isi | Menyentuh |
|---|---|---|
| 1 | Pratinjau Cetak + Unduh PDF (LibreOffice) | layar editor, route unduh, `lib/lkjip/pdf.ts` |
| 2 | Header + pilihan footer | `style_config`, `docgen.ts`, ⚙ Pengaturan |
| 3 | Huruf per kata + daftar huruf lebih banyak | narasi (Tiptap, penyaring, `narasiToXml`) |
| 4 | Gambar: perataan, bingkai, berdampingan | payload GAMBAR/GRAFIK, `docgen.ts` |
| 5 (opsional) | Catatan kaki | narasi, `docgen.ts` |

Yang sengaja tidak dikerjakan dijelaskan di §7.

---

## 1. Pratinjau Cetak dan Unduh PDF

### 1.1 Masalah

Editor menampilkan blok, bukan halaman. Bentuk akhirnya baru terlihat setelah Word diunduh dan dibuka. Termasuk di sini: di halaman berapa tabel terpotong, apakah gambar lompat ke halaman berikutnya, dan apakah judul tertinggal sendirian di dasar halaman.

### 1.2 Cara kerja — LibreOffice di server (revisi 2026-11-16)

Pratinjau adalah **PDF yang dibuat LibreOffice dari berkas `.docx` yang sama persis dengan tombol Unduh Word**. PDF itu juga yang diunduh lewat tombol **Unduh PDF**. Jadi pratinjau, PDF, dan Word bersumber satu: `rakitDocx`. Tidak ada gambaran kedua yang bisa berbeda (bentuk L78 di sisi tampilan).

Rancangan pertama memakai `docx-preview` di peramban ditambah pemecah halaman buatan PRIMA. Rancangan itu **dibatalkan**, karena:

- `docx-preview` tidak memecah halaman dan tidak menghitung field. Nomor halaman, Daftar Isi, dan letak potongan semuanya harus ditiru sendiri, dan ketepatannya hanya perkiraan.
- LibreOffice memang mesin tata letak dokumen. Ia memecah halaman, mengisi nomor halaman, dan memperbarui Daftar Isi/Tabel/Gambar/Grafik sendiri. Hasil ukurnya ada di §1.3.

Yang dibuang bersama rancangan lama: `lib/lkjip/pratinjau-halaman.ts` (`susunHalaman`), label "perkiraan" di Daftar Isi, dan cetak lewat `window.print()`.

**Cara mengubah** (`lib/lkjip/pdf.ts`, server):

1. `rakitDocx` → berkas `.docx` di folder sementara milik permintaan itu.
2. Python bawaan LibreOffice menjalankan skrip `lib/lkjip/lo/ke-pdf.py` lewat UNO. Langkahnya:
   - buka berkas tersembunyi, **makro tidak pernah dijalankan** (`MacroExecutionMode` = NEVER);
   - perbarui semua daftar dua kali, karena Daftar Isi yang memanjang bisa menggeser halaman sesudahnya;
   - perbarui field;
   - ekspor dengan `writer_pdf_Export`, penanda bab ikut (`ExportBookmarks`) sehingga panel samping penampil PDF bisa melompat ke BAB.
3. Folder sementara dihapus, baik berhasil maupun gagal.

Mengapa UNO dan bukan `soffice --convert-to pdf` biasa: perintah biasa tidak memperbarui Daftar Isi. PRIMA menulis Daftar Isi tanpa nomor halaman (`entriDaftar`) dan menyerahkan pengisiannya ke pembaruan field.

**Batas pemakaian sumber daya.** Laptop server dipakai bersama modul lain.

- Satu konversi pada satu waktu per proses aplikasi. Yang datang sesudahnya mengantre, paling banyak 3.
- Antrean penuh → 503 "Server sedang membuat PDF lain, coba beberapa detik lagi".
- Batas waktu 90 detik. Lewat dari itu, proses LibreOffice dimatikan beserta anaknya (`taskkill /T /F` di Windows, `kill` grup proses di Linux).
- Profil LibreOffice sendiri per proses aplikasi (`-env:UserInstallation`). Profil tidak berbagi dengan LibreOffice yang mungkin dibuka orang di laptop itu. Kalau PM2 menjalankan beberapa proses, nama folder profil membawa PID.
- Sambungan UNO lewat pipe bernama acak, bukan port TCP: tidak bentrok dengan port lain dan tidak terbuka ke jaringan.

**Lokasi LibreOffice:** env `LIBREOFFICE_PROGRAM`, yaitu folder `program` (berisi `soffice` dan `python`). Kosong → dicari di lokasi pasang bawaan Windows dan Linux. Tidak ketemu → fitur PDF mati dengan kalimat yang jelas (§1.5), Unduh Word tetap jalan.

### 1.3 Hasil ukur (2026-11-16, laptop pengembang, LibreOffice 26.8.3)

Bahan uji: berkas pemilik "LKJIP Amino 2025.docx". Berkas itu diimpor lewat pembaca impor PRIMA, lalu dirakit ulang lewat `rakitDocx`, sehingga yang diuji adalah keluaran PRIMA sungguhan: 23 bagian, 96 blok, 16 gambar. Word dibaca lewat COM sesudah semua daftar dan field diperbarui (`Range.Information(wdActiveEndPageNumber)`).

| Ukuran | Microsoft Word | LibreOffice |
|---|---|---|
| Jumlah halaman | 63 | 62 |
| Halaman 23 judul bab/sub-bab | — | 16 sama persis, 7 lebih awal 1 halaman |
| Daftar terisi nomor halaman | 4 daftar | 4 daftar, nomornya cocok dengan nomor di kaki halaman |
| Nomor halaman kaki | i–vi, lalu 1–56 | i–vi, lalu 1–55 |
| Waktu | — | 4 detik termasuk menyalakan LibreOffice |

Ketujuh judul yang bergeser semuanya sesudah 3.1 (bagian dengan tabel-tabel panjang). Geserannya tidak bertambah sesudah itu, tetap 1 halaman sampai akhir. Penyebab pastinya belum dicari: tinggi baris tabel atau pemotongan baris teks rata kanan-kiri. Saat eksekusi dicek apakah ada setelan tabel di `docgen.ts` yang dibaca LibreOffice berbeda dari Word dan bisa disamakan tanpa mengubah tampilan Word.

Sebagai pembanding: berkas Word asli pemilik (tanpa lewat PRIMA) bergeser sampai 3 halaman. Itu tidak menyangkut fitur ini, karena PRIMA selalu mengubah keluarannya sendiri, yang susunannya jauh lebih sederhana.

**Batas yang belum terverifikasi:**

- **Huruf.** LibreOffice memakai huruf yang terpasang di server. Bila huruf dokumen (mis. Bookman Old Style, ikut Office) tidak ada, ia menggantinya diam-diam dan letak halaman bergeser. Saat eksekusi: PDF hasilnya diperiksa huruf yang benar-benar tertanam (dibaca pdfjs). Bila huruf dokumen tidak ada, kepala pratinjau menyebut "Huruf X tidak terpasang di server; PDF memakai pengganti, letak halaman bisa berbeda dari Word."
- **Server kantor.** Pengukuran di atas di laptop pengembang. LibreOffice wajib dipasang juga di laptop server (D9), dan hasilnya diukur ulang di sana.

Kepala pratinjau tetap menyebut acuan pastinya: "Dibuat oleh LibreOffice dari berkas Word yang sama. Bila letak halaman berbeda, yang berlaku Word."

### 1.4 Layar

- **Tombol:** "Pratinjau" dan "Unduh PDF" di dock editor, di sebelah Unduh Word. Keduanya tersedia juga untuk dokumen FINAL karena hanya membaca.
- **Modal layar penuh berisi penampil PDF bawaan peramban** (iframe dengan URL `blob:`, sudah diizinkan CSP `frame-src 'self' blob:` dan dipakai Riwayat PK). Perbesaran, lompat halaman, panel bab, cetak, dan simpan sudah disediakan penampil itu, jadi PRIMA tidak membuat semua itu sendiri.
- **Kepala modal:**
  - jumlah halaman;
  - kalimat acuan (§1.3);
  - peringatan huruf bila ada;
  - tombol Unduh PDF dan Unduh Word.
- **Ponsel:** Chrome Android tidak menampilkan PDF di dalam iframe. Di layar sempit modal menampilkan tombol "Buka PDF" (membuka berkasnya). Perilaku ini **belum terverifikasi** di ponsel sungguhan dan akan dicoba di 375 px.
- **Blok yang belum disimpan.** Pratinjau dan PDF memakai isi **tersimpan**, sama seperti Unduh Word. Bila `kotorRef` tidak kosong, dialog bertanya dulu: "Ada 2 blok belum disimpan; pratinjau memakai isi tersimpan." Pilihannya Lanjutkan / Batal. Tanpa dialog ini orang melihat pratinjau lama dan mengira suntingannya hilang.
- **Menunggu:** konversi butuh beberapa detik, jadi modal langsung terbuka dengan keterangan "Menyusun halaman…" dan bisa dibatalkan. Muatan bernomor giliran: jawaban yang datang terlambat (misalnya sesudah modal ditutup dan dibuka lagi) dibuang.

### 1.5 Server

Route unduh dipakai ulang: `GET /api/lkjip/[id]/generate?format=pdf`, ditambah `&tampil=1` untuk pratinjau.

- **Isi Word-nya sama**, sehingga tidak ada pintu ketiga yang bisa berbeda.
- **`tampil=1`:** dikirim `inline`, dicatat audit `LKJIP_PRATINJAU`. Membuka pratinjau bukan mengunduh dokumen. Jenis audit baru ini wajib digolongkan di `retensi-audit.ts` (masuk 12 bulan).
- **Unduh PDF:** dikirim `attachment`, dicatat `LKJIP_GENERATE` dengan detail `format: pdf`.
- **Batas laju:** kunci sendiri (`'pdf'`, 10 per menit per orang). Selain itu ada antrean §1.2 untuk seluruh server.
- **Akses dan sakelar** sama dengan route unduh (`guard()`).
- **LibreOffice tidak terpasang** → 503 `PDF_TIDAK_TERSEDIA`. Halaman editor (server component) juga memeriksa keberadaannya lalu mengoper `pdfTersedia` ke layar. Bila tidak ada, tombol Pratinjau/Unduh PDF mati dengan tooltip yang menyebut sebabnya. Tombol mati tanpa sebab adalah UX buruk.
- **Galat konversi** (berkas rusak, batas waktu) → 500 dengan pesan manusiawi, dan dicatat di log server. Word tetap bisa diunduh.

### 1.6 Pemasangan di laptop server kantor

1. Pasang LibreOffice (unduhan resmi libreoffice.org, versi 26.8 atau sesudahnya) di lokasi bawaan `C:\Program Files\LibreOffice`. Python ikut terpasang di folder `program`, tidak perlu Python terpisah.
2. Pastikan huruf yang dipakai dokumen ada di `C:\Windows\Fonts`. Bookman Old Style, Garamond, Century Gothic, dan Book Antiqua ikut Office, bukan Windows.
3. Bila LibreOffice dipasang di tempat lain, isi `LIBREOFFICE_PROGRAM` di `.env.local` dengan folder `program`-nya.
4. Mulai ulang PRIMA (`pm2 restart`). Halaman editor memeriksa keberadaan LibreOffice saat dibuka.
5. Cek: buka dokumen LKJIP → Pratinjau. Kalau kepala pratinjau menyebut huruf tidak terpasang, kembali ke langkah 2.

Proses LibreOffice berjalan di bawah akun yang menjalankan PM2. Folder profilnya ada di folder sementara akun itu (`prima-lo-profil-<pid>`) dan dibuat sendiri saat pertama dipakai.

### 1.7 Uji

- `scripts/test-lkjip-pdf.mts`:
  - konversi sungguhan pada dokumen uji yang memuat tabel panjang, tabel mendatar, gambar, dan Daftar Isi/Tabel/Gambar;
  - jumlah halaman wajar;
  - Daftar Isi terisi nomor dan nomornya = nomor di kaki halaman judul itu;
  - nomor kaki romawi → angka, bersambung melewati section mendatar;
  - penanda bab ada;
  - folder sementara bersih sesudahnya.

  Bila LibreOffice tidak ada di mesin uji, bagian ini **gagal**, bukan dilewati diam-diam (pelajaran uji DB BBA).
- **Antrean dan batas waktu:**
  - konversi kedua menunggu yang pertama;
  - antrean penuh → 503;
  - proses yang melewati batas waktu benar-benar mati, tanpa sisa `soffice` di daftar proses.
- **Route:** `format=pdf` + `tampil=1` mencatat jenis audit yang benar, dan `PDF_TIDAK_TERSEDIA` bila LibreOffice tidak ada.
- Uji mutasi untuk aturan di atas.
- **Pengukuran §1.3 diulang** dengan skrip yang dipakai hari ini (Word COM vs PDF), lalu hasilnya ditulis di sini.
- Diuji di peramban pada dokumen kotak pasir 2099 dengan akun dummy, termasuk 375 px.

### 1.8 Catatan pelaksanaan (2026-11-16)

- **Tombol mati.** `FloatingDock` diberi `mati` (alasan), dengan `aria-disabled`, bukan `disabled`, supaya tooltip alasannya tetap terbaca. Keputusan pemilik: pilihan A.
- **Windows Defender.** "Controlled folder access" memblokir `soffice.bin` yang menyentuh folder Documents. Sebabnya: LibreOffice mewarisi folder kerja aplikasi, dan di laptop pengembang aplikasi itu ada di Documents. Sekarang LibreOffice dijalankan dari folder kerja sementaranya, dan log Defender tidak mencatat blokir baru.
- **Batas waktu.** Proses yang melewati batas dimatikan lalu ditunggu benar-benar keluar, dan folder dihapus dengan percobaan ulang. Sebelumnya folder tertinggal karena Windows masih memegang berkasnya.
- **Judul PDF** diisi judul dokumen. Tanpa itu penampil peramban menampilkan nama blob acak.
- **Permintaan yang dibatalkan peramban** selagi mengantre tidak dikerjakan (499, tanpa audit). Di mode pengembangan React membuka dua permintaan per pembukaan; sebelumnya keduanya dikonversi dan diaudit.
- **Diperiksa di peramban** (localhost, akun dummy, dokumen 2040 hanya dibaca): pratinjau 8 halaman, tema gelap/terang, 375 px menampilkan "Buka PDF" tanpa geser mendatar, satu pembukaan = satu catatan audit. Unduh PDF dari dock dan penampilan di ponsel sungguhan **belum** dicoba.
---

## 2. Header dan pilihan footer

### 2.1 Sekarang

- Hanya ada footer, dan footer hanya muncul bila "Nomor halaman" menyala.
- Bila teks footer diisi: teks di kiri, nomor halaman di kanan.
- Bila teks footer kosong: nomor halaman di tengah.
- Sampul tanpa footer.

### 2.2 Tambahan di `style_config`

Semua kunci di bawah wajib didaftarkan di `StyleConfigSchema`, karena Zod membuang kunci yang tidak dikenalnya. Bawaannya membuat dokumen lama keluar persis sama seperti sekarang.

| Kunci | Nilai | Bawaan |
|---|---|---|
| `headerText` | teks ≤ 120 | `''` (tanpa header) |
| `headerRata` | `kiri` / `tengah` / `kanan` | `tengah` |
| `headerGaris` | garis tipis di bawah header | `false` |
| `footerGaris` | garis tipis di atas footer | `false` |
| `nomorPosisi` | `otomatis` / `tengah` / `kanan` | `otomatis` (= perilaku sekarang) |

- **Header di Word:** `header.xml` dan `header2.xml` (versi lebar untuk section mendatar, pola footer2), dirujuk `w:headerReference` di `sectProps`.
- **Halaman yang memakai header:** sama dengan footer. Sampul tidak memakai keduanya. Untuk halaman daftar, lihat D4.
- **Footer tanpa nomor halaman (D5):** teks footer boleh tampil walau nomor halaman dimatikan. Isian teks footer di ⚙ Pengaturan tidak lagi mati saat nomor halaman mati.
  - Akibat yang perlu diketahui: dokumen lama yang nomor halamannya mati tetapi teks footernya pernah terisi akan mulai menampilkan teks itu. Sebelum dipasang, saya hitung dulu berapa dokumen seperti itu di data kantor/dev.
- **Impor Word (jika ada):** teks header/footer bawaan berkas (`header1.xml`/`footer1.xml`, teks polos tanpa field) dibawa ke `headerText`/`footerText`.

### 2.3 Uji

- Isi `header*.xml`/`footer*.xml`, rujukan di tiap section, dan kesamaan dengan dokumen lama bila semua kunci bawaan.
- Dibuka di Microsoft Word (COM): teks header tiap section, nomor halaman tetap bersambung.

### 2.4 Catatan pelaksanaan (2026-11-16)

- **Header satu berkas** (`header.xml`, rId6) dipakai section tegak maupun melintang, karena header tidak memakai tab. Berkas itu hanya ditulis bila teks header terisi. Dokumen tanpa header keluar persis seperti sebelum §2: Word dari kode lama dan baru dibandingkan per berkas pada 6 setelan, dan `document.xml` identik. Yang berbeda hanya `footer.xml` saat nomor halaman mati, berkas yang memang tidak dirujuk halaman mana pun.
- **Sampul** dipisah section sendiri begitu ada header ATAU footer, bukan lagi hanya bila nomor halaman menyala. Tanpa itu header ikut tampil di sampul.
- **D5:** di basis data pengembangan 0 dokumen terdampak. Data kantor **belum** dihitung.
- **Impor Word:** section tanpa rujukan header/footer mewarisi milik section sebelumnya (aturan Word), jadi rujukan dicari mundur. Pada berkas pemilik, footer terbaca "LKJIP RSJD dr. Amino Gondohutomo Tahun 2025". Hasil field (PAGE, DATE) dibuang.
- **Header & footer tidak ikut Cari-Ganti** (tidak ada di konsep). Bisa ditambahkan kalau dibutuhkan.
- **Regresi:** `npx tsx scripts/test-lkjip-header-footer.mts` (43; bagian F memakai PDF LibreOffice untuk memeriksa letak header dan nomor di kertas), 23 uji mutasi tertangkap. Satu sempat lolos: rujukan luar yang berkasnya memang tidak ada.
---

## 3. Huruf per kata + daftar huruf

### 3.1 Daftar huruf

Sekarang: Arial, Calibri, Times New Roman, Bookman Old Style, Cambria (`FONT_CHOICES`).

Usulan tambahan (D6), hanya huruf yang ikut terpasang bersama Windows atau Office:

| Huruf | Ikut |
|---|---|
| Tahoma, Verdana, Segoe UI, Georgia | Windows |
| Garamond, Century Gothic, Book Antiqua | Office |

Huruf hanya tampil benar bila terpasang di komputer yang membuka Word. Hal yang sama berlaku untuk tampilan editor dan pratinjau. Huruf unduhan sengaja tidak ditawarkan: di komputer pembaca lain, Word diam-diam menggantinya.

Daftar ini **satu** (`FONT_CHOICES`), dipakai pilihan dokumen DAN pilihan per kata.

### 3.2 Huruf per kata di narasi

- Pemilih huruf di bilah alat narasi, di samping ukuran huruf. Mark `textStyle` mendapat atribut `fontFamily`.
- **Penyaring** (`sanitizeNarasiHtml`): `font-family` hanya diterima bila namanya ada di `FONT_CHOICES`. Keluarannya dibentuk ulang dari nama di daftar, bukan disalin dari masukan (pola `color`/`font-size`).
- **Word:** `narasiToXml` menulis `w:rFonts` per run. Run tanpa huruf sendiri tetap mengikuti huruf dokumen.
- **Yang wajib ikut:**
  - Hapus format membuang huruf;
  - Kuas format membawanya;
  - tempel dari Word membawa huruf yang ada di daftar dan membuang yang lain (teks ikut huruf dokumen);
  - impor Word sama, dan huruf isi yang paling lazim menjadi huruf dokumen bila ada di daftar.
- **Tabel dan judul bab** tetap memakai huruf dokumen. Huruf per sel tidak termasuk konsep ini.

### 3.3 Uji

Penyaring (nama di luar daftar ditolak, upaya menyisipkan CSS lain ditolak), `narasiToXml` (rFonts per run, bersarang dengan tebal/warna), Hapus format, tempel. Diuji mutasi.

### 3.4 Catatan pelaksanaan (2026-11-17)

- **Satu sumber aturan** di `lib/lkjip/style-constants.ts` (aman-klien): `FONT_CHOICES`, `hurufSah` (nama → ejaan daftar), `hurufDariGaya` (hanya keluarga PERTAMA `font-family` yang dinilai; `mso-*-font-family` bukan `font-family`; entitas `&quot;` diurai dulu karena `;`-nya bukan akhir deklarasi), `saringHurufTempel`. Dipakai penyaring, editor, tempel, `docgen.ts`, dan impor Word.
- **Tanda `textStyle` pindah** dari `TiptapNarasi.tsx` ke `lib/lkjip/ekstensi-narasi.ts` supaya bisa diuji dengan skema ProseMirror sungguhan. Isinya sama, ditambah atribut `fontFamily`.
- **Ukuran "Bawaan" dulu membuang seluruh tanda** bila tak ada warna. Sekarang hanya ukuran yang dilepas; huruf tetap. Pilihan "Huruf dokumen" di pemilih huruf melepas huruf dengan cara yang sama.
- **Tempel:** saringan dipasang sesudah pembaca Word dan berlaku untuk semua tempelan, bukan hanya dari Word. Huruf yang sama dengan huruf dokumen dibuang, sebab Word menulis huruf di hampir tiap run. Papan klip Word asli (Aptos) tidak menyisakan satu pun `font-family`.
- **Impor Word:** sebelumnya huruf run tidak dibaca sama sekali. Sekarang huruf diwarisi seperti Word: run → gaya karakter (`w:rStyle`, lewat basedOn) → gaya paragraf (lewat basedOn) → docDefaults → Times New Roman. Rujukan tema (`minorHAnsi`/`majorHAnsi`) dibaca dari `theme1.xml`. Huruf isi paling lazim (ditimbang panjang teks, tanpa judul, keterangan, daftar isi) menjadi huruf dokumen bila ada di daftar. Bila tidak ada, dokumen memakai Arial dan pratinjau impor menyebutnya.
- **Kalibrasi:** LKJIP pemilik (amino) → Arial tanpa span; LKJIP 2019 dan 2017 RSJD → Cambria (dulu jadi Arial); 2017 membawa 1 span Times New Roman.
- **Regresi:** `npx tsx scripts/test-lkjip-huruf.mts [berkas.docx …]` (57; bagian G memakai PDF LibreOffice untuk memastikan ke-12 huruf tertanam). Uji mutasi: lihat CLAUDE.md.

---

## 4. Gambar

### 4.1 Perataan

Sekarang semua gambar dan grafik rata tengah (`jc center` di `docgen.ts`).

- Tambahan: `rata` = `kiri` / `tengah` / `kanan` di payload GAMBAR dan GRAFIK, bawaan `tengah`.
- Keterangan gambar ("Gambar 3.1 …") ikut perataan gambarnya.
- Editor menampilkan perataan yang sama.

### 4.2 Bingkai

`bingkai`: garis tipis 0,75 pt di sekeliling gambar, bawaan mati. Di Word ditulis sebagai garis bentuk gambar (`a:ln` di `pic:spPr`), jadi tetap terlihat bila gambar dipindah di Word.

Apakah LibreOffice menggambar garis ini **belum terverifikasi**, dan diperiksa lewat PDF-nya saat eksekusi. Bila tidak, garisnya ditulis dengan cara yang dibaca keduanya (garis bingkai paragraf/sel).

### 4.3 Gambar berdampingan

Untuk foto kegiatan kiri–kanan. Sekarang satu blok hanya satu gambar.

- **Payload:** GAMBAR mendapat `tambahan` = ≤ 2 gambar lagi (D7), masing-masing `{fileId, lebarEmu, tinggiEmu, potong, sub}`. Gambar pertama tetap di kunci lama, jadi blok lama tidak berubah.
- **Word:** tabel tanpa garis, satu kolom per gambar, lebar dibagi rata dari bidang tulis. Ukuran tiap gambar dibatasi lebar kolomnya lewat aturan yang sama dengan `ukuran-gambar.ts`.
- **Penomoran:** satu nomor "Gambar n" dan satu keterangan di bawah. `sub` opsional per gambar ("(a) Rapat koordinasi"). Daftar Gambar menghitung satu.
- **Semua yang membaca `fileId` blok gambar wajib ikut** (L69):
  - `collectImages` di `docgen.ts`;
  - pratinjau gambar editor;
  - izin unduh berkas;
  - Riwayat versi;
  - `cari-ganti.ts` (teks `sub` adalah bidang teks baru);
  - pemeriksa skema.

  Daftar pastinya dicari ulang saat eksekusi dengan pencarian `fileId`.

### 4.4 Uji

Payload lama sah tanpa perubahan, XML Word (perataan, `a:ln`, tabel tanpa garis + lebar), Daftar Gambar tetap satu entri. Dibuka di Microsoft Word.

### 4.5 Catatan pelaksanaan (2026-11-17)

- **Satu sumber aturan** `lib/lkjip/atur-gambar.ts` (aman-klien): `bacaAturGambar` (payload lama = tengah, tanpa bingkai), `daftarGambar` (gambar pertama di kunci lama + `tambahan` ≤ 2), `berkasBlok` (semua id berkas blok — dipakai pengambil gambar Drive di `docgen.ts`). Lebar kolom berdampingan = `lebarMaksEmu(n)` di `ukuran-gambar.ts`: bidang tulis dibagi rata dikurangi jarak sel 2 × 108 dxa. `jepitUkuran`/`ukuranTampilEmu`/`gayaPratinjau`/`ubahLebar` menerima batas lebar itu, dan tanpa batas tetap seperti dulu.
- **Kunci baru** WAJIB di skema: `rata`/`bingkai` (Gambar & Grafik), `sub` + `tambahan` (Gambar). Payload lama keluar persis sama di Word: gambar & keterangan tengah, tanpa `a:ln`, tanpa tabel.
- **Bingkai di LibreOffice — terjawab:** `a:ln` digambar (PDF: 4 sisi per gambar), jadi tidak perlu cara kedua. Microsoft Word membacanya sebagai garis gambar 0,75 pt.
- **`sub` gambar pertama** di kunci `sub` blok (konsep hanya menyebut `sub` per gambar tambahan). Satu gambar ber-`sub` tetap tanpa tabel; teksnya di bawah gambar.
- **Cari-Ganti:** tempat baru `{ jenis: 'sub', blockId, i }` (`i` 0 = gambar pertama), juga di `GantiTeksSchema`; hasil di atas 200 huruf ditolak.
- **Editor:** isian Letak + Bingkai dipakai blok Gambar dan Grafik. Perubahan dikirim sebagian dan digabung ke nilai terbaru: dua klik cepat (rata lalu bingkai) sempat saling menimpa saat diuji di peramban. "Tambah gambar di sampingnya" baru muncul setelah gambar pertama ada. Kolom ditumpuk di layar ≤ 760 px.
- **Dibuka di Microsoft Word:** tiga gambar sebaris = satu tabel 3 kolom tanpa garis (PDF Word hanya memuat garis bingkai), tiap gambar 4,78 cm = lebar kolom, rata kanan terbaca di gambar dan keterangan, Daftar Gambar 3 entri untuk 3 blok.
- **Peramban (dokumen 2040, blok uji dihapus sesudahnya, memakai 2 gambar lama di Drive):** 3 gambar sungguhan sebaris dengan bingkai, "Di Word: 4,79 × 2,39 cm" per kolom, gambar 6 cm rata kanan menempel di tepi kanan bidang tulis, dan di layar 375 px ketiganya ditumpuk tanpa geser mendatar.
- **Regresi:** `npx tsx scripts/test-lkjip-gambar.mts` (44; bagian F PDF LibreOffice: letak 3 gambar sebaris, jumlah garis bingkai), 36 uji mutasi tertangkap. `test-lkjip-ukuran-gambar.mts` disesuaikan ke bentuk simpan baru.

---

## 5. Catatan kaki (opsional, D8)

- **Di narasi:** tombol "Catatan kaki" menyisipkan penanda atom `<span data-catatan="…">` yang tampil sebagai angka kecil. Teks catatannya disunting di popover.
- **Word:** `footnotes.xml` + `w:footnoteReference`. Nomornya dihitung Word, jadi tetap benar walau urutannya berubah.
- **Yang wajib ikut:** penyaring, Hapus format (tidak membuang catatan), Cari-Ganti, impor Word.

Tahap ini paling besar dan paling jarang dipakai di LKJIP. Saran saya ditunda sampai Tahap 1–4 dipakai.

---

## 6. Urutan dan risiko

1. **Tahap 1 dulu.** Pratinjau membuat tahap sesudahnya bisa diperiksa tanpa membuka Word tiap kali.
   - **Risiko 1:** pemasangan di laptop server, yaitu LibreOffice dan huruf yang sama. Bila belum terpasang, fitur PDF mati dengan jelas dan Word tidak terganggu.
   - **Risiko 2:** beban CPU saat konversi (± 4 detik per dokumen). Dijaga antrean satu-per-satu.
2. **Tahap 2–4** masing-masing kecil dan saling lepas.
3. **Tidak ada migrasi.** `style_config` dan `payload` sudah JSON. Hal baru di sisi server:
   - jenis audit `LKJIP_PRATINJAU`;
   - env `LIBREOFFICE_PROGRAM` (opsional).

## 7. Sengaja tidak

- **Teks membungkus gambar (wrap).** Posisinya di Word sendiri sering lompat saat isi bergeser. Meniru dari web menghasilkan dokumen yang lebih berantakan daripada gambar di baris sendiri.
- **Kertas F4 dan margin per dokumen.** Lebar bidang tulis (`LEBAR_DXA` di `halaman.ts`) adalah angka tetap yang dipakai penggaris, lebar tabel, batas gambar, indent, dan Word. Mengubahnya menyentuh semua itu. Bisa dikerjakan sebagai konsep sendiri bila memang dibutuhkan.
- **Menjalankan Microsoft Word di server untuk membuat PDF.** Hasilnya paling persis, tetapi otomatisasi Office di server tidak didukung Microsoft dan mudah macet tanpa ada yang melihat. Ini terbukti di uji COM sebelumnya: instance yang tertinggal menahan ekspor berikutnya. LibreOffice dirancang untuk berjalan tanpa layar.
- **Pratinjau di peramban (`docx-preview` + pemecah halaman PRIMA).** Rancangan pertama, dibatalkan (§1.2).
- **PDF ikut diarsipkan ke Drive saat Simpan Versi/Finalisasi.** Bisa ditambahkan belakangan (D10). Arsip Word sudah ada dan PDF bisa dibuat ulang darinya.

## 8. Keputusan pemilik

| No | Pertanyaan | Usulan |
|---|---|---|
| D1 | Pratinjau = PDF buatan LibreOffice dari Word yang sama (menggantikan pemecah halaman PRIMA)? | Ya |
| D2 | Daftar Isi di pratinjau/PDF | Terjawab sendiri: LibreOffice mengisinya, tidak perlu label "perkiraan" |
| D3 | Tombol Unduh PDF di dock & pratinjau? | Ya |
| D4 | Header tampil juga di halaman Kata Pengantar & Daftar, atau isi saja? | Sama dengan footer: daftar + isi |
| D5 | Teks footer boleh tampil tanpa nomor halaman? | Ya |
| D6 | Huruf tambahan: 7 huruf di §3.1? | Ya |
| D7 | Gambar berdampingan maksimal 2 atau 3? | 3 (pemakaian lazim 2) |
| D8 | Catatan kaki dikerjakan sekarang atau nanti? | Nanti |
| D9 | LibreOffice dipasang juga di laptop server kantor (versi sama, 26.8)? Huruf dokumen (Bookman Old Style dll.) harus ada di sana | Ya — dipasang sebelum kodenya; tanpa itu tombol PDF mati dengan keterangan |
| D10 | PDF ikut diarsipkan ke Drive saat Simpan Versi/Finalisasi? | Nanti |
