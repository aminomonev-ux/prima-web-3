# Konsep — Daftar ala Word, klik kanan, dan format teks di narasi LKJIP

Status: disetujui pemilik 2026-11-07. Kelanjutan `CONCEPT-lkjip-penggaris-narasi.md`. Nol migrasi, nol endpoint.

## 1. Masalah

| Bagian | Sekarang | Akibat |
|---|---|---|
| Format daftar | Hanya bullet, `1.`, `a.`; tingkat 2 tetap `1.` | Dokumen dinas yang memakai `1. a. 1) a)` tak bisa ditulis |
| Berkas pemilik | 165 butir: `a)` 14, `1)` 7, tingkat 2 ada 12 | Impor mengubahnya jadi `a.`/`1.` dan meratakan tingkatnya |
| Klik kanan | Menu bawaan peramban | Tak ada jalan cepat ke format, daftar, dan nomor |
| Bilah alat | Ukuran "12" = 12 px = 9 pt di Word; tombol rata hanya mengenai paragraf | Angkanya menipu; sub-judul tak bisa dirata tengah |

## 2. Keputusan pemilik

- Susunan bawaan saat Tab: **`1. → a. → 1) → a) → (1) → (a)`**, format yang dipakai berkas pemilik. Bawaan Word (`1. → a. → i.`) tetap ada di galeri.
- Dikerjakan sekarang: daftar, klik kanan, paket kecil (ukuran pt, rata sub-judul, Undo/Redo, Hapus format, super/subscript, stabilo, daftar otomatis saat mengetik, ubah huruf).
- Tabel: centang "Ulangi kepala" di pengaturan cetak (bawaan menyala).
- Dikerjakan menyusul (§10): dialog Paragraf dengan spasi per paragraf, tempel daftar dari Word, kuas format, Tab di dalam paragraf, nomor `1.1.` tetap otomatis saat impor.
- Pemisah halaman dan Cari & Ganti seluruh dokumen dikerjakan sesudahnya (§11).

## 3. Model data

Disimpan di HTML narasi, lewat penyaring yang sama. Tanpa kolom baru.

```html
<ol data-gaya="(1)" start="3" data-susunan="1.|a.|1)|a)|(1)|(a)|i.|1.|a." data-lanjut="1">
```

| Atribut | Pada | Arti |
|---|---|---|
| `data-gaya` | tiap `ol`/`ul` | Kode format, daftar tertutup di `gaya-daftar.ts`. Tak ada = `1.` / `•`, jadi dokumen lama tidak berubah. `<ol type="a">` lama tetap dibaca sebagai `a.` |
| `data-susunan` | akar saja | Format 9 tingkat, setara `abstractNum` Word. **Hanya editor yang membacanya**, untuk Tab dan galeri |
| `data-lanjut` | akar | "Lanjutkan penomoran" di tengah blok. Daftar pertama blok tetap memakai centang "Lanjut daftar" |

Kode format: `1. 1) (1) a. a) (a) A. A) (A) I. I) (I) i. i) (i) 1.1.` dan bullet `• ● ○ ▪ ➢ ✓ –`.

**Format milik TINGKAT, bukan butir** (cara Word). Tab, Shift+Tab, dan galeri selalu menyamakan seluruh pohon daftar dengan susunannya, jadi butir yang naik tingkat ikut berganti nomor tanpa disentuh. `data-gaya` per daftar tetap ditulis supaya CSS dan ekspor Word tidak perlu menghitung ulang susunan.

## 4. Satu sumber aturan

`lib/lkjip/gaya-daftar.ts` (murni) dipakai CSS editor, penyaring, `docgen.ts`, `lanjut-daftar.ts`, `impor-word.ts`, dan galeri. Menambah format = satu baris. Aturan teks di `lib/lkjip/format-teks.ts`, perintah editor di `lib/lkjip/perintah-narasi.ts`; keduanya bisa diuji tanpa peramban.

## 5. Word

- `numbering.xml` dibuat dari susunan yang dipakai. Daftar bersarang satu pohon berbagi `numId` + `ilvl` naik, jadi Word sendiri yang memulai ulang sub-nomor dan `%1.%2.` membaca nomor induknya.
- Dua daftar bersarang di satu butir, atau bersarang ber-`start`, dapat `numId` sendiri ber-`startOverride`.
- Gantung mengikuti lebar nomor (`gantungDxa`): `1.1.1.` tidak muat di 0,63 cm. Penggaris, CSS, dan `numbering.xml` memakai angka yang sama.
- Bullet selain `•`/`–` memakai huruf Segoe UI Symbol, karena Arial tidak punya bentuknya.

## 6. Klik kanan

Potong, Salin, Tempel · Hapus format, Ubah huruf ▸, Paragraf… · Penomoran ▸, Bullet ▸, Daftar bertingkat ▸ · (di dalam daftar) Turun/Naik tingkat, Mulai ulang dari 1, Lanjutkan penomoran, Atur nomor awal… · Sisipkan rujukan, Sisipkan angka.

- **Tempel** hanya hidup di alamat aman (HTTPS/localhost). Di http peramban tidak membuka `navigator.clipboard`, jadi menunya mati dan menunjuk Ctrl+V. Memori internal seperti menu tabel sengaja tidak dipakai: bisa menempel isi lama sesudah orang menyalin dari aplikasi lain.
- **Shift + klik kanan** membuka menu peramban (saran ejaan). Dokumen FINAL tetap memakai menu peramban.
- **Paragraf…** berisi perataan, indent, dan spasi (§10.2).

## 7. Impor Word

Format dan tingkat dibawa utuh: butir tingkat 2 menjadi daftar bersarang sungguhan selama satu abstrak, sehingga Tab/Shift+Tab bekerja dan Word menomorinya sama. Romawi tidak lagi jadi angka. Pola dengan awalan tetap (`1.%1`, "Bab %1") tidak bisa dibawa dan jatuh ke `1.`; di berkas pemilik pola itu hanya dipakai judul dan daftar isi. `1.1.` yang terpotong paragraf tetap anak sungguhan (§10.1); yang induknya terpotong tabel atau batas blok ditulis sebagai teks, supaya tercetak sama dengan berkas asal.

## 8. Yang sengaja tidak

- Bullet gambar dan "Define New Number Format".
- `1.1.` di tengah pohon campuran: mengganti satu tingkat pohon `1.1.` ke format lain menurunkan tingkat di bawahnya ke format biasa, supaya CSS dan Word tidak berbeda bunyi.
- Nomor lewat 26 (`aa`): CSS dan Word berbeda bentuk (`ab` vs `bb`). Dibiarkan, langka di dokumen ini.

## 9. Verifikasi

- `scripts/test-lkjip-daftar-word.mts` (152), 73 uji mutasi tertangkap.
- Microsoft Word (`ListString`): 993/993 butir, semua format & bersarang. Berkas pemilik impor → ekspor: 0 beda indent, 0 beda nomor.
- Peramban pada kotak pasir 2099 dengan akun dummy: galeri, Tab/Shift+Tab, klik kanan & sub-menu, Mulai ulang, Lanjutkan, Atur nomor awal, Paragraf…, Potong, ubah huruf + Shift+F3, stabilo, superskrip, ukuran pt, rata sub-judul, daftar otomatis + Backspace, simpan & muat ulang, tema terang, 375 px, dokumen lama tidak berubah.
- Belum dibuktikan: Tempel dari menu di alamat aman (izin papan klip ditolak di panel uji, jalur penolakannya yang teruji) dan Ctrl+= di peramban sungguhan.

## 10. Paket sedang (disetujui pemilik 2026-11-07)

### 10.1 Nomor `1.1.` saat impor

Berkas pemilik menulis `1. Tujuan`, paragraf penjelas tanpa nomor, lalu `1.1. Sasaran`. Word bisa karena ia hanya membaca hitungan. Pembaca impor dulu menutup daftar begitu bertemu paragraf tanpa nomor, jadi `1.1.` kehilangan induknya.

Kini paragraf tanpa nomor yang disusul `1.1.` milik pohon yang sama masuk ke butir yang sedang terbuka, sebagai paragraf kedua butir. Hanya untuk `1.1.`: daftar lain tetap memakai `start` seperti dulu. Syaratnya tiap tingkat di atasnya sedang terbuka dengan nomor yang sama persis, supaya `2.1.` tidak menumpang `1.`. Induk yang terpotong tabel atau batas blok tetap ditulis sebagai teks.

Paragraf kedua butir punya jenis indent sendiri, `lanjutan`: bawaannya rata dengan teks butir, isiannya angka mutlak dari tepi kolom, jadi posisi berkas asal kembali utuh. Penggaris dan dialog Paragraf mengenai paragraf itu sendiri, bukan butirnya. Enter di dalamnya tetap paragraf tanpa nomor seperti Word; Enter di paragraf kosong menjadi butir bernomor baru, sebab Enter di paragraf pertama membawa penjelasnya ikut turun.

Penyusun pohon pindah ke `lib/lkjip/susun-daftar.ts`, dipakai impor dan tempel.

### 10.2 Dialog Paragraf: spasi

Bahasa Word, disimpan sebagai `data-sp-sebelum`, `data-sp-sesudah` (twips), `data-sp-baris` (1/240 baris) di `p`, `hN`, `li`. Hanya yang berbeda dari Pengaturan Dokumen yang disimpan, sama seperti indent. Aturannya di `halaman.ts`, dipakai dialog, penyaring, dan `docgen.ts` (`numPr → spacing → ind → jc`). Baris hanya kelipatan; "tepat" dan "paling sedikit" sengaja tidak ada. Margin sub-judul di editor kini mengikuti Word (dulu 8 px dipatok, padahal tercetak 0).

### 10.3 Tab

Simpul atom `tabNarasi` (`<span data-tab="1">`), bukan karakter di teks: ProseMirror meratakan spasi putih saat membaca HTML, jadi tab berubah jadi spasi begitu blok dibuka lagi. Di Word menjadi `<w:tab/>`, kelipatan 1,27 cm, sama dengan layar.

Aturan Word di dalam daftar: Tab di awal butir, atau atas pilihan satu paragraf utuh atau beberapa paragraf, menurunkan tingkat; di tengah kalimat menyisipkan tab. **Ini mengubah perilaku**: dulu Tab di mana pun dalam daftar menurunkan tingkat. Shift+Tab di luar daftar sengaja dilepas supaya pengguna papan ketik tetap bisa keluar dari editor. Tab berkas Word ikut terbawa saat impor.

Sengaja tidak: titik tab buatan (`w:tabs`) dan AutoFormat Word yang mengubah Tab di awal paragraf menjadi indent. Paragraf yang kiri-nya bukan kelipatan 1,27 cm menghitung titik tab dari tepi paragraf di layar, dari tepi kolom di Word.

### 10.4 Kuas format

Klik = sekali pakai, klik dua kali = berkali-kali sampai Esc. Berlaku lintas blok narasi: formatnya disimpan sebagai JSON di luar komponen, sebab tiap blok punya editor dan objek skema sendiri.

Format huruf mengenai teks terpilih; tanpa pilihan, kata di kursor. Format paragraf (perataan, spasi, indent, judul) hanya mengenai paragraf yang seluruh teksnya terpilih, supaya menyapu satu kata tidak mengubah perataan paragrafnya. Daftar sengaja tidak ikut, sebab format daftar milik pohonnya; indent butir juga tidak, sebab milik tingkatnya.

### 10.5 Tempel dari Word

Word menempelkan daftar sebagai paragraf biasa: `<p style="mso-list:l0 level1 lfo1"><![if !supportLists]>1.  <![endif]>Teks</p>`. `lib/lkjip/tempel-word.ts` membacanya jadi daftar sungguhan lewat `transformPastedHTML`: tingkat dari `mso-list`, format dari `@list` di `<style>` (tanpa itu, dari penanda), nomor awal dari penanda, indent dari gaya paragraf atau kelasnya. Tab Word (`mso-tab-count`) ikut jadi tab. Yang bukan dari Word dikembalikan apa adanya. Bentuknya dari papan klip Word sungguhan, `scripts/fixtures/lkjip-papan-klip/word-daftar.html`.

Sengaja tidak: spasi dari tempelan. Word selalu membawa `margin-bottom:8pt; line-height:107%`, jadi tiap tempelan akan menimpa Pengaturan Dokumen. Google Docs dan Word Online memakai `<ol>`/`<ul>` biasa dan tetap dibaca editor apa adanya.

### 10.6 Verifikasi

- `npx tsx scripts/test-lkjip-narasi-sedang.mts` (172), 109 uji mutasi: 108 tertangkap, 1 tidak mengubah perilaku (pSpasi = null: tag pembuka selalu membaca ulang).
- Microsoft Word: `2. → 2.1. → 2.2. → 3. → 3.1.` lewat paragraf penjelas; spasi sebelum/sesudah/baris, tab, dan indent paragraf kedua terbaca sama. Berkas pemilik impor → ekspor: 0 beda indent, 0 beda nomor, `1.1.`, `2.1.`, `2.2.` kini nomor otomatis.
- Peramban pada kotak pasir 2099 dengan akun dummy: Tab di tiga posisi, Enter di paragraf kedua & paragraf kosong, kuas sebagian/paragraf utuh/lintas blok/berkali-kali/Esc, dialog Paragraf + Undo & Redo satu langkah, tempelan HTML papan klip Word lewat peristiwa `paste`, simpan & muat ulang tanpa memunculkan Simpan, tema terang, 375 px, Shift+Tab keluar editor. Data uji & akun dummy sudah dihapus.
- Belum dibuktikan: Ctrl+V sungguhan dari jendela Word ke peramban (yang teruji peristiwa `paste` dengan HTML dari papan klip Word).
- Temuan saat diuji: nomor induk kosong (`.1. Z`) saat `1.1.` mulai tanpa induk, karena larik berlubang; pengisi spasi Word salah dikenali karena `mso-bidi-theme-font:` juga berakhiran `font:`; paragraf berpenanda tak terbaca menjadi teks "undefined"; gantung `1.1.` di bawah `1.` di editor tidak sama dengan `numbering.xml`.

## 11. Pemisah halaman dan Cari & Ganti (disetujui pemilik 2026-11-07)

### 11.1 Pemisah halaman

Ctrl+Enter, tombol bilah alat, atau klik kanan. Simpul atom `<hr data-halaman="1">`, di Word `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`. Garis bawaan Tiptap dimatikan: `---` dulu melahirkan garis yang hilang saat Simpan, karena penyaring membuangnya. Penyaring hanya menerima `hr` bertanda.

Tengah kalimat membelah paragraf, sisanya di halaman baru. Di dalam butir, sisa kalimat menjadi paragraf kedua butir. Di awal butir ditolak dengan pesan, sebab butir wajib diawali paragraf; penggantinya kursor di akhir butir sebelumnya. Tempelan dari Word (`<br clear=all style='page-break-before:always'>` + paragraf kosong sisanya) ikut jadi pemisah.

Sengaja tidak: pemisah dari berkas saat Impor Word. Spasi per paragraf berkas belum ikut terimpor, jadi aliran halaman berbeda, dan pemisah yang dibuat untuk aliran lama bisa melahirkan halaman setengah kosong.

### 11.2 Cari & Ganti seluruh dokumen

Dock "Cari & Ganti" atau Ctrl+H; Ctrl+F dari dalam narasi. Ctrl+F dari tempat lain tetap pencarian peramban, dari dalam tabel tetap pencarian tabel itu. Panel, bukan modal, supaya naskahnya tetap terbaca. Kata yang dicari disorot di narasi yang terbuka.

Yang dicari: Kata Pengantar, judul bab, narasi, judul & keterangan tabel/gambar/grafik, sel tabel. Aturannya satu berkas murni, `lib/lkjip/cari-ganti.ts`: layar mencari di sana, server mengganti di sana, jadi angka di tombol "Ganti semua (n)" sama dengan yang tertulis (diuji).

Kecocokan boleh melintasi tebal/miring (hasilnya mengikuti format awal), tidak melintasi paragraf, baris baru, tab, angka tertaut, atau rujukan. Pengganti disandikan sebagai teks, bukan HTML.

Terbaca tapi ditahan, dengan alasan di daftarnya: judul BAB wajib, sel tabel tertaut (resepnya memegang isian tangan per kunci), kolom No., hasil rumus, angka yang hanya cocok di tampilan berformatnya. Teks rumus tidak dicari.

**Menulis lewat satu route**, `POST /api/lkjip/[id]/ganti`, bukan tiap blok dari layar: kunci baris dokumen lalu baris blok `FOR UPDATE`, membaca isi terbaru, semua lewat `parseBlockPayload`, satu transaksi. Satu blok tak lolos skema = semuanya batal. Hasil melewati 50.000 huruf narasi ditolak, sebab penyaring memotongnya diam-diam. Audit `LKJIP_GANTI_TEKS`.

**Ganti semua memotret dokumen dulu** ke Riwayat (`saveVersi`), karena tak ada Undo lintas blok; dialog menyebutnya. Foto ini ikut retensi 20 versi.

**Mencari isi tersimpan.** Editor blok memegang ketikan di state lokal, jadi menulis di belakangnya akan ditimpa balik atau menghapus ketikan. Karena itu Ganti ditolak selama ada blok yang belum disimpan, dan sesudah Ganti editor di layar dimuat ulang lewat `key`.

### 11.3 Verifikasi

- `npx tsx --env-file=.env.local scripts/test-lkjip-cari-ganti.mts` (127), 81 uji mutasi: 80 tertangkap, 1 setara (penjaga skema: canReplaceWith sudah menolak).
- Microsoft Word: teks sesudah pemisah mulai di tepi atas halaman baru, tanpa baris kosong; nomor daftar lanjut melewati pemisah di dalam butir.
- Peramban pada kotak pasir 2099 dengan akun dummy: panel lewat dock, Ctrl+H, dan Ctrl+F dari narasi; Ctrl+F dari tabel tetap pencarian tabel; sorotan; angka tertaut tidak tersentuh; Ganti ditolak saat ada ketikan belum tersimpan; Ganti satu; Ganti semua + foto Riwayat + pulihkan; pengganti berisi `<b>` tampil sebagai teks; Esc; Ctrl+Enter, tampilannya, simpan, unduh Word; pemisah di awal butir ditolak dengan pesan; tema terang; 375 px. Data uji & akun dummy sudah dihapus.
- Belum dibuktikan: Word Online dan LibreOffice membuka `w:br type=page` sama (hanya Microsoft Word yang dicoba).
