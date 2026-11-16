# LKJIP — Impor dari Word

2026-11-04, **dikerjakan 2026-11-05** dengan D1–D4 sesuai rekomendasi (§6); hasil & penyimpangan dari
rancangan di §9. Bahan kalibrasi: "LKJIP Amino 2025.docx" milik pemilik (3 MB). Berkasnya tetap di
komputer pemilik dan tidak masuk repo.

## 1. Masalah

LKJIP tahun-tahun sebelumnya disusun manual di Word. Untuk memakai PRIMA, isinya harus diketik ulang
bab demi bab: narasi, 29 tabel, 17 gambar. LKJIP baru bisa **mengekspor** ke Word (`generate`), belum
bisa membaca Word.

## 2. Isi berkas kalibrasi (dibaca, bukan ditebak)

| Bagian | Isi | Catatan |
|---|---|---|
| Bab | 4 (BAB I–IV) | Judul 1, ditulis dua paragraf: "BAB I" + "PENDAHULUAN"; ada 1 Judul 1 kosong |
| Sub-bab | 19 | 17 bergaya Judul 2 (+2 Judul 2 kosong). INOVASI & PENGHARGAAN bergaya **Normal** tapi memakai daftar bernomor yang sama dengan Judul 2 (ikut daftar isi) |
| Narasi | ±450 paragraf | 151 butir daftar bernomor: angka 129, huruf 107, **romawi kecil 96**, bullet 1; 673 potongan tebal |
| Tabel | 29, semuanya tabel Word asli | Grid Word sampai 22 kolom, tapi **kolom nyata paling banyak 12** sesudah garis grid yang tidak dipakai sel mana pun dibuang. Baris terbanyak 18. Banyak sel gabungan. 2 tabel (T14, T15) tanpa `gridCol` — lebarnya harus dibaca dari sel |
| Gambar | 17 tempel (16 berkas jpg/png, 26–301 KB) | 9 berketerangan "Gambar n", **8 berketerangan "Grafik n"** — grafiknya berupa GAMBAR, bukan grafik Excel |
| Keterangan | "Tabel n" / "Gambar n" / "Grafik n" | Ditulis tidak seragam: kadang Judul 3 dan dipecah 2–3 paragraf ("Tabel 1" / "SDM RSJD…" / "Berdasarkan Status Kepegawaian"), kadang Normal. 43 paragraf Judul 3 sebenarnya baris judul objek, bukan sub-sub-bab. "Tabel 6" tanpa baris judul, judulnya hanya ada di Daftar Tabel |
| Depan | Sampul, Daftar Isi/Tabel/Gambar/Grafik, Kata Pengantar | Kata Pengantar 5 paragraf + tanda tangan (jabatan 2 baris, nama, pangkat, NIP) |
| Halaman | 13 section, 1 melintang | |
| Lampiran | Ada di daftar isi (PK, RKT) | Isinya tidak berupa bab di badan dokumen |
| Lain | 0 catatan kaki, 0 komentar, 0 kotak teks, header/footer tanpa gambar | |

## 3. Alur pemakai

1. Daftar dokumen LKJIP → tombol **Impor dari Word** (di samping Buat Dokumen).
2. Modal: tahun + judul (bawaan dari berkas) + pilih berkas `.docx`.
3. **Pratinjau**:
   - kiri: pohon hasil baca (bab, sub-bab, dan di tiap simpul jumlah narasi, tabel, gambar);
   - kanan: ringkasan angka dan peringatan, misalnya "2 judul kosong dibuang", "Grafik 1–8 masuk sebagai
     gambar", "96 butir romawi jadi angka", "Lampiran PK & RKT tidak ada di badan dokumen";
   - tiap simpul bisa diubah jenisnya: **Bab / Sub-bab / Judul objek / Narasi / Buang**. Ini jalan
     keluar bila pengenalan salah (mis. "Landasan Hukum" sebenarnya bagian DUKUNGAN SDM).
4. **Buat dokumen** → dokumen **DRAFT baru**, editor langsung terbuka. Tidak pernah menimpa dokumen
   yang sudah ada.

## 4. Pemetaan Word → LKJIP

| Di Word | Jadi | Aturan |
|---|---|---|
| Judul 1 ("BAB I" + "PENDAHULUAN") | Bab | Judul = nama bab tanpa "BAB I" (nomor dihitung `numbering.ts`); BAB I–IV `locked=1` seperti template standar (D4) |
| Judul 2, atau paragraf bernomor di daftar yang sama dengan Judul 2 | Sub-bab | Nomor otomatis Word ("A.", "1.") dibuang, LKJIP menomori sendiri |
| Judul 3+ yang bukan baris judul objek | Sub-sub-bab | `MAX_DEPTH` 5 cukup |
| Judul kosong | dibuang | Disebut di peringatan |
| "Tabel n …" / "Gambar n …" / "Grafik n …" + baris Judul 3 sesudahnya sampai objeknya | Judul objek berikutnya | Bila baris judulnya kosong, diambil dari entri Daftar Tabel/Gambar/Grafik bernomor sama |
| Paragraf biasa | Blok Narasi | Paragraf berurutan digabung jadi satu blok sampai bertemu tabel, gambar, atau judul; dipecah bila > 50.000 huruf (batas `NarasiPayloadSchema`). Dibawa: tebal, garis bawah, rata paragraf, daftar (angka → `ol`, huruf → `ol type="a"`, bullet → `ul`, bertingkat ikut `ilvl`). Hasilnya lewat `sanitizeNarasiHtml` yang sama dengan editor |
| Daftar romawi kecil | lihat D2 | |
| Tabel Word | Blok Tabel | **Grid dirapikan**: batas kolom yang tidak menjadi tepi sel mana pun dibuang (22 → 12). Gabungan `gridSpan`/`vMerge` → `cs`/`rs`. Baris kepala = baris bertanda "ulangi sebagai judul" (`tblHeader`), kalau tidak ada baris pertama (maks 4). Rata per sel, tebal per sel. Angka tetap teks seperti tertulis ("1.250.000" — rumus LKJIP sudah membaca gaya Indonesia). Lebar kolom dari `gridCol`, cadangannya `tcW` |
| Tabel > 12 kolom nyata / > 500 baris | tidak diimpor | Disebut di peringatan, letaknya ditandai narasi "[Tabel n tidak muat — salin manual]". Di berkas kalibrasi: 0 |
| Tabel di section melintang | `melintang: true` | |
| Gambar jpg/png/gif/webp | Blok Gambar | Diunggah ke Drive folder LKJIP + `uploaded_files` context `lkjip` (jalur sama dengan tombol unggah). Gambar yang sama dipakai dua kali diunggah sekali |
| Gambar berketerangan "Grafik n" | lihat D1 | |
| EMF/WMF/SVG, gambar > 10 MB | dilewati | Disebut di peringatan (batas unggah 10 MB) |
| Kata Pengantar | Pengaturan Dokumen | Isi → `kataPengantarHtml`; baris tanda tangan dikenali dari bawah: NIP (berawalan "NIP"), pangkat, nama, jabatan (sisa, boleh 2 baris), tempat-tanggal (pola "Kota, tanggal") → kolom `ttd*`. Yang tidak yakin dibiarkan kosong dan disebut |
| Sampul, Daftar Isi/Tabel/Gambar/Grafik | dilewati | LKJIP membuat ulang dengan nomor yang benar |
| Huruf, ukuran, warna, spasi, header/footer, nomor halaman | tidak dibawa | Mengikuti Pengaturan Dokumen LKJIP |
| Judul 1 sesudah BAB IV (mis. LAMPIRAN) | Bab tak terkunci | Berkas kalibrasi tidak punya — disebut di peringatan |

## 5. Teknis

- **Pembaca MURNI** `lib/lkjip/impor-word.ts`: bytes docx → `{ judul, kataPengantar, ttd, bab[] (pohon +
  blok), gambar[] (ref, mime, ukuran), peringatan[] }`. Tanpa DB/Drive, supaya bisa diuji dengan docx
  buatan uji dan dengan berkas kalibrasi. PizZip (sudah dipakai `docgen.ts`) + pembaca XML kecil milik
  sendiri untuk unsur yang dipakai (`w:p`, `w:r`, `w:t`, `w:tbl`, `w:tr`, `w:tc`, `a:blip`, `w:numPr`,
  `w:sectPr`) — **tanpa dependensi baru** (`@xmldom/xmldom` hanya transitif; menambah dependensi =
  `package-lock` diregen dengan npm 10.8.2, L57).
- **Route** `app/api/lkjip/impor/route.ts`, POST multipart, `step=pratinjau|buat`:
  - penjaga LKJIP yang sama (`isLkjipRole` + sakelar `app_status_lkjip`, gate G memindainya sendiri),
    `lkjipRateLimit`;
  - `pratinjau` **tidak menulis apa pun**;
  - `buat` mengunggah **berkas yang sama lagi** dan server membacanya ulang (pola Impor KIB BBA): layar
    hanya mengirim koreksi per nomor simpul + sidik SHA-256 berkas, jadi koreksi tidak bisa terpasang ke
    berkas lain (409 `PRATINJAU_BASI`).
- **Pagar berkas** (L67): ≤ 9,5 MB (bukan 20 MB — §9), harus zip berisi `word/document.xml` (`.doc` lama ditolak: "Simpan
  sebagai .docx dulu"), `document.xml` terurai ≤ 30 MB, ≤ 200 media, ≤ 2.000 blok hasil.
- **Tulis**:
  1. Gambar diunggah DULU, di luar transaksi. Panggilan Google yang lambat tidak boleh menahan
     transaksi. Gambar yang gagal → blok Gambar tanpa `fileId` + peringatan, bukan membatalkan semuanya.
  2. Lalu SATU `withTransaction`: `lkjip_dokumen` (DRAFT) + `style_config` + `lkjip_section` (insert per
     tingkat, karena `parent_id` butuh id induk; anak sebaris lewat `bulkInsert`) + `lkjip_block`
     (`bulkInsert`). Payload tiap blok lewat `parseBlockPayload` (Zod yang sama dengan editor).
  3. Bila transaksi gagal, gambar yang sudah naik ke Drive yatim. Itu aman karena tidak dirujuk siapa
     pun; dicatat di log.
- **Satu jalur pembuatan dokumen** (L78): `createDokumen` diperluas menerima struktur hasil impor, bukan
  fungsi INSERT kedua.
- Audit `LKJIP_IMPOR_WORD` (nama berkas, sidik, jumlah bab/tabel/gambar, peringatan); WAJIB digolongkan
  di `retensi-audit.ts`.
- **Nol migrasi.** D1(a) hanya menambah satu nilai enum di payload JSON, tanpa kolom DB.

## 6. Keputusan untuk pemilik

| | Pilihan | Rekomendasi |
|---|---|---|
| **D1** Grafik yang berupa gambar | (a) blok **Grafik** bersumber baru "gambar": nomor "Grafik n" & Daftar Grafik benar; di editor tampil gambarnya + tombol "Ganti dengan grafik dari tabel". (b) blok Gambar biasa: bernomor "Gambar 10–17" dan Daftar Grafik kosong | **(a)** — (b) membuat nomor & daftar salah |
| **D2** Daftar romawi kecil (96 butir) | (a) jadi angka biasa + peringatan. (b) tambah dukungan `ol` romawi di editor, penyaring, dan Word | **(a)** dulu; (b) tahap terpisah bila memang sering dipakai. **Tahap (b) selesai 2026-11-07** (`CONCEPT-lkjip-daftar-word.md`): romawi, kurung, dan tingkat terbawa |
| **D3** Pintu masuk | (a) selalu dokumen BARU. (b) impor ke dokumen yang sudah ada (menimpa / menambah bab) | **(a)** — (b) membuka risiko menimpa isi yang sudah disunting |
| **D4** BAB I–IV dikunci | (a) ya, seperti template standar. (b) tidak | **(a)** |

## 7. Sengaja tidak

- Angka tabel **tidak** ditautkan ke modul otomatis. Menebak sumbernya bisa salah tanpa terlihat;
  Hubungkan ke Modul tetap tombol manusia.
- Gambar grafik tidak diubah jadi grafik hidup (angkanya tidak ada di berkas).
- Tidak membaca `.doc` lama atau PDF. Tidak membawa gaya visual, perubahan terlacak, atau komentar.
- Berkas Word aslinya tidak disimpan di PRIMA.

## 8. Tahapan & uji

1. **Pembaca** + `scripts/test-lkjip-impor-word.mts`. Docx kecil dibangun di dalam uji (PizZip):
   gabungan, keterangan terpecah, judul kosong, daftar bertingkat, gambar, melintang, grid berserpih.
   Ditambah kalibrasi bila path berkas pemilik diberikan sebagai argumen.

   **Target kalibrasi**: 4 bab · 19 sub-bab · 29 tabel (0 ditolak, kolom nyata ≤ 12) · 9 gambar + 8 grafik
   · kata pengantar + tanda tangan · 0 judul objek yang jadi sub-bab.
2. **Route + transaksi + audit**, uji DB di tahun kotak pasir.
3. **Modal pratinjau & koreksi**, verifikasi di peramban dengan berkas kalibrasi ke tahun kotak pasir
   (dokumen ujinya dihapus sesudahnya). Hasil Word-nya dibandingkan dengan berkas asli: jumlah bab, tabel,
   gambar, dan urutannya.

Uji mutasi untuk aturan pengenalan: keterangan vs sub-bab, perapian grid, gabungan, tanda tangan.

## 9. Hasil pengerjaan (2026-11-05)

Berkas: `lib/lkjip/impor-word.ts` (pembaca MURNI) + `lib/lkjip/impor-word-jenis.ts` (jenis penanda,
label, batas — aman-klien, supaya modal tidak menyeret PizZip) + `app/api/lkjip/impor/route.ts` +
`app/(dashboard)/lkjip/ImporWordModal.tsx` + `createDokumen(…, impor)` di `lib/lkjip/data.ts` + sumber
`'gambar'` pada `GrafikPayloadSchema` dan `GrafikEditor`. Nol migrasi.

**Kalibrasi** (berkas pemilik, 69 ms): 4 bab terkunci · 19 sub-bab · 29 tabel (0 ditolak, kolom ≤ 12) ·
9 gambar + 8 grafik bergambar · 50 blok narasi · Kata Pengantar 5 paragraf + tanda tangan lengkap · 0
judul objek yang jadi bagian. Peringatan yang muncul: 2 judul kosong, "Landasan Hukum" (Judul 2 tetapi
bernomor di daftar butir DUKUNGAN SDM), LAMPIRAN kosong, 8 grafik bergambar.

**Berbeda dari rancangan, dengan alasan:**

1. **Batas berkas 9,5 MB, bukan 20 MB.** `proxy.ts` (Next 16) hanya meneruskan 10 MB pertama badan
   permintaan (`proxyClientMaxBodySize`); berkas lebih besar tiba terpotong dan zip-nya rusak. Menaikkan
   batas itu berlaku untuk SEMUA route, jadi tidak diubah — pesannya menyuruh mengompres gambar di Word.
2. **`<ol start="n">` ditambahkan** ke penyaring narasi dan docgen (`startOverride`). Di berkas kalibrasi
   banyak daftar terpotong paragraf atau tabel lalu berlanjut ("a. Visi … b. Misi … c. Tujuan"); tanpa
   `start` setiap potongan kembali ke 1/a. Tiptap sudah membawa atribut ini; yang dulu membuangnya
   penyaring. Daftar dibuat RATA (tingkat 2 jadi daftar tersendiri) karena docgen menulis semua butir di
   ilvl 0. Romawi (D2) jadi angka — di berkas kalibrasi ternyata 0 butir romawi yang dipakai; angka 96 di
   §2 adalah definisi di numbering.xml, bukan pemakaian.
3. **LAMPIRAN tanpa isi tidak dibuat** (§4 menyebut "bab tak terkunci"): docgen menomori bab tambahan
   "BAB V", dan isinya (PK, RKT) memang tidak ada di badan. Ada isinya → tetap bab + peringatan.
4. **Hitungan nomor daftar** meniru Word: num sebabstrak berbagi hitungan kecuali punya
   `startOverride`; butir tingkat atas mengulang tingkat di bawahnya.
5. **Keterangan di bawah objek** juga dikenali; bila objek ada di depan DAN di belakang keterangan,
   arahnya mengikuti kebiasaan berkas itu (per jenis: tabel / gambar).
6. **Grafik Word asli** (bukan gambar) dibaca dari cache datanya jadi blok Grafik data manual — gambarnya
   baru ada sesudah Simpan Grafik di editor (diperingatkan). Berkas kalibrasi: 0.
7. **Gambar di paragraf Judul kosong** (Gambar 9 berkas kalibrasi ada di paragraf Judul 1 kosong) tetap
   gambar, bukan judul kosong yang dibuang.

**Uji:** `npx tsx --env-file=.env.local scripts/test-lkjip-impor-word.mts [berkas.docx]` — docx buatan uji
(A pembaca, B koreksi, C variasi berkas, D penyaring + Word + ekspor-lalu-impor balik, E tulis MySQL
2099 dihapus sesudahnya, F kalibrasi bila berkas diberikan) — 69 + 11 kalibrasi, **32 uji mutasi
tertangkap**. Satu sempat LOLOS karena data ujinya tidak pernah menguji keterangan rata kiri yang diikuti
paragraf narasi sebelum tabelnya (A38 ditambahkan).

**Diverifikasi di aplikasi** (2026-11-05, laptop dev): pratinjau HTTP berkas kalibrasi 3 MB = ringkasan
yang sama dengan suite, jawaban 17 KB (isi blok tidak dikirim ke peramban). Di peramban dengan docx uji
kecil: pratinjau, koreksi (sub-bab → narasi, dibaca ulang server), Buat ke 2099 → editor terbuka, koreksi
ikut terpasang di server, 2 gambar naik ke Drive + baris `uploaded_files` (`context lkjip`), audit
`LKJIP_IMPOR_WORD`, "b. Misi" tampil dengan `start=2`, gambar Grafik termuat; ekspor Word dokumen itu
membawa kedua gambar + `startOverride`, dan dibaca ulang identik. Lebar 375 px & tema terang diperiksa.
Dokumen uji dihapus. **Tertinggal di Drive** (kode tidak punya fungsi hapus Drive):
`impor-word-571405f2-1.png`, `impor-word-571405f2-2.png`.
