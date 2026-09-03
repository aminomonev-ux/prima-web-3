# CONCEPT — Catatan Perpindahan sampai ke berkas Cetak

**Status:** konsep, belum dieksekusi
**Tanggal:** 2026-09-03
**Pendahulunya:** `docs/CONCEPT-blud-catatan-perpindahan.md` (fiturnya sendiri, commit `b163019`)
**Menyentuh:** menu Cetak BLUD saja. Nol tabel, nol kolom, nol migrasi, nol endpoint tulis.

---

## 1. Kenapa ini perlu

Catatan Perpindahan sudah jalan di layar Pergeseran: orang mencatat "45 juta dari ATK ke Listrik", kolom Bertambah/Berkurang jadi hanya-baca dan angkanya diambil dari catatan itu. Tapi fiturnya **berhenti di layar**. Begitu dokumennya dicetak atau diunduh, ceritanya hilang.

Tiga temuan, diurutkan dari yang paling merugikan:

**T1 — kepala tabel PDF ketinggalan dua kolom.** Ini bug lama, lahir waktu L86 menambah kolom Bertambah/Berkurang, dan **sudah berdampak hari ini** tanpa ada hubungannya dengan catatan perpindahan. `renderPergeseranView` memulangkan **14** nilai per baris dengan 14 nama kolom (…Pergeseran, Bertambah, Berkurang, Selisih, PJ, Keterangan), sementara `buildMeta` di `lib/blud/export/pdf.ts:106` dan `lib/blud/export/excel.ts:112` masih memakai daftar **12** kolom dari sebelum L86 (…Pergeseran, Bertambah/Berkurang, PJ, Keterangan). Dari kolom ke-10 ke kanan, nama kolom tidak lagi menerangkan angka di bawahnya. `numberColIdx` juga tidak memuat kolom 10–11, jadi nominalnya tidak diformat sebagai angka.

**T2 — dokumen tidak tahu ada catatan.** Ada tiga pemakai `uraiGeser`; dua di antaranya tidak menerima `mutasi`:

| Tempat | Kirim `mutasi`? |
|---|---|
| `app/(dashboard)/blud/pergeseran/pergeseran-client.tsx:771` — layar | sudah |
| `lib/blud/cetak-data.ts:429` — Rekap Pergeseran (pratinjau, PDF, Excel saring) | **belum** |
| `lib/blud/export/dpa-dokumen.ts:316` — dokumen resmi 14 kolom | **belum** |

Akibatnya konkret: rekening yang catatannya "terima 45jt dari A, lepas 12jt ke C" tampil **45 / 12** di layar tapi **33 / —** di berkas, karena tanpa `mutasi` `uraiGeser` jatuh ke turunan selisih. Pagunya sama, ceritanya yang hilang — persis kerugian yang L86 dibuat untuk menutupnya.

**T3 — daftar perpindahannya sendiri belum ada di mana pun.** Tercatat di DoD konsep pendahulunya §8. Orang yang cuma memegang berkasnya tidak punya cara tahu uang itu berpindah dari mana ke mana; ia hanya melihat dua kolom hasil.

---

## 2. Satu pintu: menu Cetak

Ralat peta yang sempat saya salah sebut: **tidak ada tombol unduh di layar Pergeseran**. Semua berkas lahir dari `app/(dashboard)/blud/cetak/cetak-client.tsx`.

| Tombol | Jalur | Isinya |
|---|---|---|
| Cetak | `renderCetakHtml` → `html` | pratinjau di layar (+ Ctrl+P peramban) |
| PDF | `exportToPdf({ rows: renderedData })` | disusun ULANG dari larik baris, **bukan** dari HTML |
| Excel, saringan mati | `exportPergeseranDokumen` | dokumen resmi 14 kolom, berumus |
| Excel, saringan hidup | `exportToExcel({ rows: renderedData })` | rekap nilai statis |

Yang perlu diingat sepanjang pengerjaan: **PDF tidak dibuat dari HTML**. Apa pun yang cuma ditempel ke `html` akan tampak di pratinjau, ikut kalau orang menekan Ctrl+P, dan **hilang** di berkas PDF hasil tombol — dua jalur, dua hasil, tanpa satu galat pun. Ini bentuk L78 lagi.

---

## 3. Keputusan pokok

### 3.1 Daftar kolom punya SATU sumber

T1 lahir karena daftar kolom yang sama hidup di tiga tempat, dan satu tempat diperbarui sementara dua lainnya tidak. Menyamakan ketiganya sekarang cuma menunda kejadian yang sama pada penambahan kolom berikutnya.

`renderCetakHtml` sudah memulangkan `meta: { title, columns }` — dihitung dari view yang sama yang menyusun barisnya. Maka: **`exportToPdf`/`exportToExcel` menerima `columns` dan `title` dari pemanggil**, dan `buildMeta` turun jadi cadangan untuk pemanggil yang tidak mengirimnya. `cetak-client` satu-satunya pemanggil kedua fungsi itu, jadi perubahannya kecil dan tertutup.

`numberColIdx` **tetap di exporter** — itu urusan gaya berkas, bukan identitas kolom, dan tidak pernah dipakai layar.

**DITOLAK: menyamakan ketiga daftar saja.** Murah hari ini, dan mengembalikan bug yang sama persis pada kolom ke-15.

### 3.2 `mutasi` dioper apa adanya

Sempat saya duga catatan yang menunjuk baris tersaring keluar bisa menggelembungkan rollup induk. **Salah** — `uraiGeser` membaca petanya lewat `dariMutasi.get(row_id)` per baris, bukan menjumlah seluruh daftar, jadi catatan yang barisnya tidak ada tidak pernah dibaca. Mengoper `mutasi` mentah ke array yang sudah disaring aman secara hitungan, dan menjaganya hanya menambah aturan yang harus dipelihara.

### 3.3 Yang benar-benar berisiko: baris bersih-nol menghilang

`saringYangBergeser` menilai dari `bertambah_berkurang`, yaitu selisihnya. Rekening yang **menerima 45jt lalu melepas 45jt** berselisih nol, jadi ia tersaring keluar — padahal catatannya bilang ada uang lewat. Berkasnya lalu memuat daftar perpindahan yang menyebut rekening yang tidak ada di tabelnya.

Jawabannya bukan mengubah saringan (saringan itu benar: ia menjawab "pagu mana yang bergeser"), melainkan **berkata jujur**:

- `buangMutasiYatim(tampil, mutasi)` dipakai untuk **MENGHITUNG**, bukan untuk melindungi angka. Selisih panjang sebelum/sesudah = berapa catatan yang menyebut baris tak tercetak.
- Angka itu masuk ke `spandukSebagian` dan `catatanCakupan` yang sudah ada: "… 3 catatan perpindahan menyebut rekening yang tidak ditampilkan."

### 3.4 View baru, bukan bagian tempelan

T3 dikerjakan sebagai **view ketiga** di dropdown menu Pergeseran, di samping "Rekap Pergeseran" dan "PENANGGUNG JAWAB (Pasca-Geser)":

```ts
{ value: 'daftarPerpindahan', label: 'Daftar Perpindahan' }
```

Alasannya jalur PDF di §2. Sebagai view, ia memulangkan `rows` + `meta.columns` sendiri, lalu PDF dan Excel generik ikut jalan tanpa dikutak-atik. Sebagai bagian tempelan di bawah tabel Rekap, ia akan hidup di pratinjau dan mati di PDF.

Kolomnya: **Dari** (kode + uraian) · **Ke** · **Nilai** · **Keterangan**. Baris terakhir total. Urutan mengikuti `urutan` di tabel `pergeseran_mutasi` — itu urutan orang mencatatnya, dan itu yang paling bisa diruntut.

**View ini TIDAK tunduk saringan "hanya yang bergeser".** Saringan itu sifat view Rekap, bukan sifat dokumennya; daftar perpindahan pendek (batas Zod 2.000, kenyataannya beberapa baris), dan justru daftar inilah yang menjelaskan ke mana perginya baris yang hilang dari Rekap. `bisaSaringBergeser` di cetak-client tetap `menu === 'pergeseran' && view === 'rekapPergeseran'`, jadi kotak centangnya memang tidak muncul di view ini — tidak perlu aturan baru.

### 3.5 Dokumen resmi dapat lembar kedua

`buatWorkbookPergeseran` menambah worksheet **"Perpindahan"** dengan isi yang sama. Ini jalur terpisah dari §3.4 dan memang harus terpisah: dokumen 14 kolom itu berkas yang beredar ke luar, dan lembar keduanya yang menjawab "45 juta itu dari mana".

Kalau `mutasi` kosong, lembarnya **tidak dibuat sama sekali** — lembar kosong di dokumen resmi terbaca seperti ada yang gagal.

---

## 4. Yang berubah, per berkas

| Berkas | Perubahan |
|---|---|
| `lib/blud/export/pdf.ts` | `columns`/`title` opsional di args; `buildMeta` jadi cadangan; daftar 12 kolom disamakan jadi 14 |
| `lib/blud/export/excel.ts` | idem, + `numberColIdx` memuat kolom Bertambah/Berkurang |
| `lib/blud/cetak-data.ts` | `RenderArgs.mutasi`; `uraiGeser(sorted, mutasi)`; hitung catatan yatim untuk spanduk; view `daftarPerpindahan` |
| `lib/blud/export/dpa-dokumen.ts` | `UnduhDokumenArgs.mutasi`; `uraiGeser(rows, mutasi)`; lembar "Perpindahan" |
| `app/(dashboard)/blud/cetak/cetak-client.tsx` | simpan `rawMutasi` dari respons GET; oper ke `renderCetakHtml`, kedua exporter, dan `exportPergeseranDokumen`; satu entri `VIEW_OPTIONS` |

Satu hal teknis yang berlaku untuk semuanya: **`mutasi` tidak ada di dalam `rawRows`**. Ia field sejajar di respons `GET /api/blud/pergeseran` (`route.ts:105`), dan cetak-client hari ini hanya membaca `data` + `versi_tanggal` (`cetak-client.tsx:169`). Tali itu yang pertama harus disambung; sisanya menyusul.

---

## 5. Yang sengaja TIDAK dikerjakan

- **Menu DPA nol tersentuh.** Tidak ada catatan perpindahan di sana.
- **View PENANGGUNG JAWAB (Pasca-Geser) nol tersentuh.** Nominalnya `r.pergeseran` — pagu, dan catatan tidak pernah menggeser pagu.
- **Tidak ada endpoint baru.** `GET /api/blud/pergeseran` sudah memulangkan `mutasi`; menambah rute khusus cetak berarti pagar izin kedua untuk data yang sama.
- **Catatan tidak dipakai menyusun ulang urutan baris tabel Rekap.** Godaannya ada (mengelompokkan asal dan tujuan berdampingan), tapi urutan baris dokumen anggaran adalah urutan rekeningnya. Itu view lain, bukan penyempurnaan view ini.

---

## 6. Definition of Done

1. `npx tsc --noEmit` bersih, ESLint bersih, Gate E (token warna) lolos.
2. Rekap Pergeseran: kepala tabel PDF **14 kolom**, cocok satu-satu dengan datanya; nominal Bertambah/Berkurang terformat angka di Excel.
3. Baris bercatatan mencetak **45 / 12**, bukan 33 / —, di: pratinjau, PDF, Excel saring, dan dokumen resmi 14 kolom.
4. Dengan saringan hidup, spanduk menyebut berapa catatan yang barisnya tidak ditampilkan.
5. View "Daftar Perpindahan" tampil di pratinjau, PDF, dan Excel dengan isi yang sama; kotak centang saringan tidak muncul di view ini.
6. Dokumen resmi punya lembar "Perpindahan" kalau ada catatan, dan **tidak punya** lembar itu kalau tidak ada.
7. `mutasi` kosong → seluruh keluaran identik dengan hari ini (kecuali perbaikan kepala tabel T1, yang memang harus berubah).

### Regresi — `scripts/test-blud-cetak-perpindahan.mts`

Diuji **sungguhan** lewat `renderCetakHtml` dan `buatWorkbookPergeseran`, bukan dicocokkan ke teks sumber, mengikuti pola `test-blud-dokumen-rumus.mts`.

Yang wajib ada di pohon uji, dan tidak akan ketemu tanpa disengaja:

- **Baris bersih-nol** — menerima 45 **dan** melepas 45, selisih nol. Ini satu-satunya bentuk yang membuat baris bercatatan menghilang dari saringan (§3.3). Data uji "A turun 45, B naik 45" tidak akan pernah menemukannya karena kedua barisnya lolos saring.
- **Induk yang menyimpan uraian tangan** sekaligus punya anak bercatatan — menguji urutan kuasa catatan > tangan > turunan lewat rollup.
- **Jumlah kolom dihitung**, bukan dicocokkan namanya: `meta.columns.length` harus sama dengan panjang tiap `rows[i]`. Pemeriksaan inilah yang akan menangkap T1 kalau lahir lagi.

Uji mutasi yang harus tertangkap (minimal): `mutasi` tidak dioper ke `uraiGeser` di masing-masing dari dua jalur · daftar kolom exporter dikembalikan ke 12 · hitungan catatan yatim dimatikan · view baru ikut disaring · lembar "Perpindahan" dibuat walau catatan kosong.

---

## 7. Yang masih perlu diputuskan

Empat pertanyaan dari konsep pendahulunya §8 masih menunggu jawaban dan **tidak diblokir** oleh konsep ini — kalau nanti dijawab, yang berubah isinya, bukan bentuknya:

1. Apakah ketidakcocokan catatan harus menahan Simpan (sekarang: menahan).
2. Apakah perpindahan boleh melintas jenis belanja.
3. Tata letak Cetak — konsep ini menjawabnya untuk daftar perpindahan, belum untuk kop/tanda tangan dokumen resminya.
4. Penandaan PJ pada perpindahan.
