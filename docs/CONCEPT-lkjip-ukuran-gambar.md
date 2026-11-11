# Konsep — Ukuran dan pratinjau gambar di LKJIP

Status: disetujui pemilik 2026-11-07 (D1 ya, D2 semua pemegang akses LKJIP). Nol migrasi (isi blok sudah JSON), nol endpoint baru.

## 1. Masalah

PRIMA tidak menyimpan ukuran gambar. Saat membuat Word, ukurannya dihitung dari piksel berkas lalu dibatasi 16 cm (`imgDimsEmu` di `docgen.ts`). Akibatnya, diukur di Microsoft Word pada berkas pemilik:

| Gambar | Berkas asal | Hasil PRIMA sekarang | Sesudah konsep ini |
|---|---|---|---|
| Sumber Anggaran (no. 1) | 15,9 × 9,8 cm | 16 × 9,9 cm | 15,5 × 9,6 cm |
| Piagam (no. 15) | 9 × 6,7 cm | 16 × 12 cm | 9 × 6,7 cm |
| Piala (no. 17) | 9,7 × 8,6 cm | 16 × 21,3 cm | 9,7 × 8,6 cm |

Temuan lain:

- **Batas 16 cm melewati bidang tulis.** Bidang tulis PRIMA 15,5 cm, jadi gambar selebar batas keluar 0,5 cm ke margin kanan.
- **Potongan gambar hilang.** Bagian yang dipotong di Word muncul lagi. Di berkas pemilik hanya satu gambar dan tipis (1%), tetapi di berkas lain bisa membuka bagian yang sengaja dibuang.
- **Blok Gambar tanpa pratinjau.** Isinya hanya tulisan "Gambar siap", gambarnya baru terlihat di Word.
- **Rekan tidak bisa melihat gambar.** `/api/upload/download` hanya mengizinkan pengunggah, admin, dan BIDANG atasan pengunggah, padahal LKJIP modul kolaboratif. Blok Grafik bergambar sudah kena ini sekarang: staf lain melihat gambar rusak.

## 2. Model data

Tiga kunci baru di payload GAMBAR dan GRAFIK, lewat Zod yang sama. Tanpa kunci = otomatis, jadi foto Riwayat lama tetap sah.

| `lebarEmu` | `tinggiEmu` | Arti | Dipakai oleh |
|---|---|---|---|
| kosong | kosong | Otomatis dari piksel | Dokumen lama, unggahan baru, tempelan |
| ada | kosong | Lebar pasti, tinggi mengikuti proporsi gambar | Isian Lebar, grafik Word |
| ada | ada | Persis seperti ini, termasuk bila gepeng | Hasil impor |

`potong` = `{ kiri, atas, kanan, bawah }` dalam 1/1000 persen, satuan yang sama dengan `a:srcRect` Word. Kosong = tanpa potongan.

Satuannya EMU supaya angka Word terbawa tanpa pembulatan. Layar menampilkan cm (360.000 EMU = 1 cm).

## 3. Satu sumber aturan

`lib/lkjip/ukuran-gambar.ts`, murni dan aman-klien. Dipakai `docgen.ts`, impor, dan editor, jadi angka di layar sama dengan angka di Word.

- `ukuranTampilEmu(setelan, alami)`: ukuran akhir dari tiga keadaan di atas.
- `gayaPratinjau(...)`: persentase untuk pratinjau, termasuk potongan.
- `proporsiMenyimpang(...)`: dasar spanduk gepeng, ambang 2%.

Batas, keduanya diperkecil sebanding:

- Lebar paling besar bidang tulis, 15,5 cm.
- Tinggi paling besar 23,2 cm, yaitu tinggi bidang tulis 24,7 cm dikurangi ruang keterangan. Keterangan diikat ke gambarnya, jadi gambar setinggi halaman membuatnya terpisah.

Ukuran dihitung per blok, bukan per berkas, karena satu berkas bisa dipakai di dua blok dengan ukuran berbeda.

## 4. Impor

| Di berkas Word | Yang dibawa |
|---|---|
| Satu gambar di `w:drawing` | `wp:extent` + `a:srcRect` |
| Beberapa gambar dalam satu grup | Otomatis. Ukuran yang tertulis milik grup, bukan tiap gambar |
| Gambar diputar atau dibalik | `a:ext` (ukuran sebelum diputar) + peringatan. Rotasi tidak dibawa |
| Gambar lama `v:shape` | `width`/`height` dari `style`. Bila ada potongan, otomatis saja supaya tidak gepeng |
| Grafik Word (`c:chart`) | Lebar saja. Gambarnya digambar PRIMA, proporsinya sendiri |
| Ukuran kosong atau 0 | Otomatis |
| Lebih besar dari batas | Diperkecil sebanding + peringatan |

Peringatan untuk berkas pemilik: "5 gambar lebih lebar dari bidang tulis PRIMA (15,5 cm), diperkecil sebanding." Margin berkas itu 2,54 cm, PRIMA 3 dan 2,5 cm.

## 5. Word

`drawingPara(info, ukuran)` menulis `wp:extent` dan `a:ext` dari `ukuranTampilEmu`, lalu `a:srcRect` di antara `a:blip` dan `a:stretch` (urutan wajib skema). `imgDimsEmu` kini memulangkan ukuran alami tanpa batas; batasnya pindah ke fungsi bersama.

## 6. Editor

Satu komponen `GambarBerukuran.tsx` untuk blok Gambar dan Grafik bersumber gambar:

- **Pratinjau.** Kotak selebar `min(100%, 420px)` mewakili bidang tulis, jadi besar gambar terhadap halaman terbaca. Rata tengah seperti di Word. `loading="lazy"`.
- **Lebar (cm).** `PrimaNumberField desimal={2}`, 1 sampai 15,5. Kosong = otomatis, dengan placeholder "Otomatis".
- **"Di Word: 9,7 × 8,6 cm".** Selalu tampil, supaya hasil akhir terbaca dalam ketiga keadaan.
- **Spanduk gepeng + tombol Kembalikan proporsi.** Hanya bila menyimpang lebih dari 2%. Tombolnya mengosongkan `tinggiEmu`.
- **Gambar gagal dimuat.** Kalimat "Gambar tidak bisa dimuat", isian tetap bisa dipakai.

Aturan:

| Aksi | Lebar | Tinggi | Potongan |
|---|---|---|---|
| Ubah lebar | baru | sebanding bila terisi | tetap |
| Kosongkan lebar | kosong | kosong | tetap |
| Ganti gambar | tetap | dilepas | dilepas |
| Grafik bersumber data manual atau tabel | isian | selalu kosong | selalu kosong |

Grafik bersumber data hanya mendapat isian Lebar. Kanvas pratinjaunya tidak diubah, karena `html2canvas` memotretnya.

Ukuran ikut tombol Simpan blok, satu jalur tulis (L78). `sidikIsi` ikut menghitungnya supaya penanda belum tersimpan menyala. Panduan di editor diperbarui.

## 7. Izin pratinjau

`/api/upload/download` mendapat cabang `owner.context === 'lkjip'` + `isLkjipRole`, pola yang sama dengan BBA (`app_access` dari DB, dikunci pada context berkas itu sendiri). Ini tidak membuka data baru: pemegang akses LKJIP sudah menerima gambar yang sama di unduhan Word.

Tiap gambar yang dibuka tetap menulis satu baris audit `FILE_DOWNLOAD`, seperti unduhan lain. `loading="lazy"` membatasi jumlahnya.

## 8. Keputusan pemilik

**D1. Gambar otomatis ikut batas 15,5 cm (saran: ya).** Sebelumnya disebut gambar di dokumen lama tidak berubah. Dengan pilihan ini, gambar otomatis yang lebih lebar dari 15,5 cm mengecil 3%, tetapi tidak lagi keluar margin. Gambar yang sangat tinggi juga berhenti di 23,2 cm. Bila "tidak": gambar otomatis tetap 16 cm, batas baru hanya berlaku untuk yang berukuran.

**D2. Izin pratinjau untuk semua pemegang akses LKJIP (saran: ya).** Bila "tidak": pratinjau hanya terlihat oleh pengunggah, admin, dan BIDANG atasannya.

## 9. Sengaja tidak

- **Gambar di tengah kalimat atau mengambang.** Di berkas pemilik 0 gambar mengambang.
- **Perataan tetap tengah.** Berkas pemilik campur: 3 kiri, 7 tengah, 7 rata kiri-kanan, dan 13 dari 17 ber-indent.
- **Keterangan gambar tetap di bawah.** Di berkas pemilik keterangannya di atas gambar. Ini aturan PRIMA yang sudah ada, bukan bagian paket ini.
- **Alat potong dan seret ukuran di editor.** Potongan hanya dibawa dari Word.
- **Dokumen yang sudah telanjur diimpor** tidak berubah. Impor ulang atau isi Lebar-nya.

**Jumlah halaman belum akan mendekati 73.** Gambar yang mengecil justru bisa membuatnya makin sedikit dari 65, sebab pemisah halaman dan baris kosong masih belum dibawa. Itu paket berikutnya.

## 10. Uji

`scripts/test-lkjip-ukuran-gambar.mts`:

- **Aturan:** tiga keadaan, potongan, batas lebar dan tinggi, masukan rusak.
- **Skema:** ketiga kunci bertahan lewat `parseBlockPayload`, payload lama jadi otomatis (kunci yang lupa didaftar dibuang Zod diam-diam).
- **Impor:** docx buatan untuk tiap baris tabel §4.
- **Word:** `wp:extent`, urutan `a:srcRect`, satu berkas di dua blok, dokumen tanpa ukuran tetap sama.
- **Editor:** kedua `onSave` membawa ukuran, Ganti gambar melepas tinggi dan potongan, grafik bersumber data selalu tanpa tinggi.
- **Izin:** cabang `lkjip` dikunci pada context berkas.
- Uji mutasi untuk semua bagian di atas.

**Kalibrasi Word 2026-11-07** — berkas pemilik `LKJIP Amino 2025.docx` diimpor lewat §G skrip uji: **17 gambar** semuanya berukuran, **5 diperkecil** ke 15,5 cm dan disebut di peringatan, **1 berpotongan** (`a:srcRect` sama), semua lolos `parseBlockPayload`. Skrip: 115 lulus, 0 gagal (A–G).

**Peramban 2026-11-07** — kotak pasir 2099, dokumen uji 436, akun `uji.lkjip.a`/`b`/`c` (sudah dihapus):

- Pratinjau keempat blok termuat lewat `/api/upload/download` (200), angka "Di Word" 9,7 × 7,28 · 9 × 6,75 · 8 × 3 · 6 × 8 cm; blok berpotongan memakai bingkai 8 × 3 cm.
- Isi Lebar 9,7 → Simpan menulis `lebarEmu` 3492000 + audit `LKJIP_BLOCK_UPDATE`; muat ulang mempertahankan angka, penanda belum tersimpan bersih.
- Kembalikan proporsi → 9 × 6,75, spanduk gepeng hilang, Simpan menyimpan `tinggiEmu: null`.
- Grafik bergambar hanya punya Lebar; grafik bersumber data menampilkan petunjuk "Tinggi mengikuti grafik".
- Tema terang: teks isian #374151 di kotak putih (`rgba(0,0,0,.15)`), 375 px tanpa geser mendatar.
- Akun rekan `uji.lkjip.b` membuka dokumen yang sama dan **semua gambar termuat** (naturalWidth 800/300) — inti §7. Akun `uji.lkjip.c` (tanpa `lkjip`) dialihkan dari `/lkjip/436` ke `/menu` dan unduhan berkasnya **403**.
- Unggah berkas baru tidak diulang putaran ini (gambarnya sudah ada di Drive); jalur Ganti gambar ditutup uji E5.
- **Ditemukan di peramban:** gambar dari cache selesai dimuat sebelum hidrasi, `onLoad` tak pernah datang, pratinjau macet di "Memuat gambar…". Diperbaiki lewat `ref` yang membaca `el.complete`. Dijaga E22–E24 (2026-11-11), 5 uji mutasi tertangkap.
