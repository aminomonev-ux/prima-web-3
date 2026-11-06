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
- Menyusul: dialog Paragraf dengan spasi per paragraf, tempel daftar dari Word, pemisah halaman, Cari & Ganti lintas blok, kuas format, Tab di dalam paragraf.

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
- **Paragraf…** kali ini berisi perataan dan indent; spasi per paragraf menyusul.

## 7. Impor Word

Format dan tingkat dibawa utuh: butir tingkat 2 menjadi daftar bersarang sungguhan selama satu abstrak, sehingga Tab/Shift+Tab bekerja dan Word menomorinya sama. Romawi tidak lagi jadi angka. Pola dengan awalan tetap (`1.%1`, "Bab %1") tidak bisa dibawa dan jatuh ke `1.`; di berkas pemilik pola itu hanya dipakai judul dan daftar isi. `1.1.` yang induknya terpotong paragraf atau tabel ditulis sebagai teks, supaya tercetak sama dengan berkas asal.

## 8. Yang sengaja tidak

- Bullet gambar dan "Define New Number Format".
- `1.1.` di tengah pohon campuran: mengganti satu tingkat pohon `1.1.` ke format lain menurunkan tingkat di bawahnya ke format biasa, supaya CSS dan Word tidak berbeda bunyi.
- Nomor lewat 26 (`aa`): CSS dan Word berbeda bentuk (`ab` vs `bb`). Dibiarkan, langka di dokumen ini.

## 9. Verifikasi

- `scripts/test-lkjip-daftar-word.mts` (152), 73 uji mutasi tertangkap.
- Microsoft Word (`ListString`): 993/993 butir, semua format & bersarang. Berkas pemilik impor → ekspor: 0 beda indent, 0 beda nomor (3 butir `1.1.` berinduk terpotong jadi teks, tercetak sama).
- Peramban pada kotak pasir 2099 dengan akun dummy: galeri, Tab/Shift+Tab, klik kanan & sub-menu, Mulai ulang, Lanjutkan, Atur nomor awal, Paragraf…, Potong, ubah huruf + Shift+F3, stabilo, superskrip, ukuran pt, rata sub-judul, daftar otomatis + Backspace, simpan & muat ulang, tema terang, 375 px, dokumen lama tidak berubah.
- Belum dibuktikan: Tempel dari menu di alamat aman (izin papan klip ditolak di panel uji, jalur penolakannya yang teruji) dan Ctrl+= di peramban sungguhan.
