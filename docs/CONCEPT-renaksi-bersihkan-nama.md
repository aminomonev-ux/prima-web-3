# Bersihkan nama Renaksi — bintang penanda & nomor `(n)` otomatis saat impor dan saat ditarik PK/IKI

Status: **dikerjakan 11 Nov 2026 dengan arah yang berbeda dari §2–§9**. Keputusan pemilik: data
Renaksi TIDAK ditulis ulang; penanda dihitung saat ditampilkan. Yang berlaku ada di §12; §2–§10
dipertahankan sebagai catatan rancangan awal.
Berkas ini menjawab dua permintaan pemilik:

1. Saat **upload** matriks Renaksi, bintang penanda (`*`…`*****`) dan nomor `(1)`, `(2)` bisa
   dibuang otomatis.
2. Saat **PK mengambil** dari Renaksi — termasuk data yang **sudah tersimpan** dengan bintang dan
   nomor — bisa ikut bersih otomatis.

---

## 1. Yang terjadi sekarang (bukti)

Tangkapan layar Matriks Realisasi Bulanan 2026 dari aplikasi sendiri sudah cukup membuktikan
bentuk datanya: nama sub kegiatan tersimpan sebagai `… Perilaku Hidup Bersih dan Sehat *****`,
dan dua indikator bersaudara tersimpan sebagai `(1) Jumlah Dokumen …` dan `(2) Jumlah Dokumen …`
— teksnya sama, hanya beda nomor.

| Titik | Perlakuan sekarang | Akibat |
|---|---|---|
| `lib/renaksi/import-renaksi.ts` | `sanitize()` hanya membuang karakter kontrol/bidi, merapatkan spasi, memotong panjang | Nama masuk **apa adanya**: `nama = isi kolom`, bintang ikut |
| `lib/renaksi/import-data.ts` (`commitImportRenaksi`) | `program/kegiatan/sub_kegiatan = row.nama` | Bintang dan `(n)` tersimpan permanen di `rencana_aksi` |
| `lib/kinerja/master-nama.ts` | **Sudah ada** `buangBintang()` (hanya `*` + spasi di ujung kanan) | Dipakai Init Renaksi & Rapikan Bintang E-Anggaran — **tidak** dipakai impor Renaksi, **tidak** dipakai PK/IKI |
| `app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts` | `program: prog.outcome_program ?? prog.program`, kegiatan/sub sama | Bintang menyalin ke `pk_sasaran` lalu ke dokumen PK |
| `app/api/perjanjian-kinerja/program/import-renaksi/route.ts` | `program/kegiatan/subkegiatan` hanya `.trim()` | Sama — bintang ikut ke `pk_program` |
| `app/api/iki/import-renaksi/route.ts` + `app/(dashboard)/iki/_lib/isi-renaksi.ts` | `rhk: outcome ?? nama`, `indikator: r.indikator` apa adanya | Bintang & `(n)` ikut ke kartu RHK/indikator IKI |
| Modul PK & IKI | **Tidak ada** alat "Rapikan" (pencarian `rapikan` di `app/(dashboard)/perjanjian-kinerja` = 0 hasil) | Data lama hanya bisa dibetulkan manual atau re-import |

### Kenapa `(n)` tidak bisa diperlakukan sama seperti bintang

Parser **memakai** `(n)` sebagai sinyal struktur: baris indikator lanjutan (tanpa nama entitas &
tanpa kode) ditambatkan ke pemiliknya lewat `indikator.match(/^\((\d+)\)/)` dan mencari baris
bernomor `n - 1`. Jadi `(n)` adalah penanda urutan indikator di dalam satu entitas — **turunan**,
bukan bagian nama. Tapi berbeda dari bintang, membuangnya bisa menabrak kunci unik (lihat §4).

---

## 2. Keputusan yang diusulkan

1. **Bintang = turunan LEVEL, bukan isi nama.** Matriks resmi menandai `*` tujuan, `**` sasaran,
   `***` program, `****` kegiatan, `*****` sub kegiatan. Karena bisa dihitung dari level, bintang
   tidak perlu hidup di dalam teks nama — dan kalau dokumen resmi membutuhkannya, **Cetak yang
   menempelkan sendiri** dari levelnya (lihat §6).
2. **Nomor `(n)` pada indikator = urutan di dalam entitas induk**, juga turunan. Dibuang dari nama
   di semua pintu baca/tulis baru, tetapi **hanya jika tidak menabrak kunci unik** (§4).
3. **Satu aturan PURE, satu tempat.** Modul baru `lib/shared/nama-resmi.ts`:
   - `rapikanNamaEntitas(s)` — buang deret `*` + spasi di ujung kanan.
   - `rapikanIndikator(s)` — buang awalan `(1)`–`(99)` + spasi sesudahnya, lalu bintang di ujung.
   `buangBintang()` di `lib/kinerja/master-nama.ts` **diganti pemanggilan helper ini** (re-export
   tipis supaya pemanggil lama tidak perlu disentuh), bukan dibiarkan sebagai salinan kedua —
   dua salinan aturan yang sama pasti menyimpang (L78).
4. **Impor Renaksi membersihkan di PREVIEW, bukan cuma di commit.** Yang terlihat di modal =
   yang disimpan. Commit mengulang pembersihan (server tidak mempercayai klien, L68).
5. **PK/IKI membersihkan saat TARIK** (read-only, tidak menulis apa pun) **dan saat SIMPAN**
   (server), sehingga data baru bersih lewat pintu mana pun. Data lama dibereskan lewat tombol
   **Rapikan Nama** per tahun (§5.9), bukan dengan pembersihan diam-diam.
6. `kode` tetap jangkar identitas; pembersihan **tidak menyentuh** `kode`, target, realisasi,
   jenis, satuan, anggaran.

---

## 3. Aturan rinci (PURE, `lib/shared/nama-resmi.ts`)

- Bintang hanya dibuang di **ujung kanan**, termasuk bila bercampur spasi (`"PROGRAM X  ***  "`).
  `"Belanja *khusus* lain"` **tidak disentuh** (bintang di tengah = bagian nama).
- Nomor hanya dibuang di **awal teks**, pola `^\s*\((\d{1,2})\)\s+`:
  - `"(1) Jumlah Dokumen …"` → `"Jumlah Dokumen …"`
  - `"Kelas (3)"`, `"Rasio 1:2 (2)"` → **tidak disentuh** (bukan awalan).
- Spasi ganda dirapatkan; `trim`; panjang tidak ditambah (tetap dipotong oleh `sanitize` di pemanggil).
- Kalau hasil pembersihan **kosong** (mis. nama yang isinya hanya `"***"`), kembalikan teks aslinya
  dan tandai barisnya — nama kosong akan ditolak Zod dan menghilangkan baris tanpa penjelasan.
- **Idempoten**: `f(f(x)) === f(x)`. Ini yang menjaga commit (yang mengulang pembersihan) tidak
  mengubah apa pun bila preview sudah bersih.

---

## 4. Bahaya utama: kunci unik — harus ditangani sebelum menulis kode

`rencana_aksi` punya `UNIQUE KEY uk_tahun_level_ind (tahun, level, indikator)`. Tangkapan layar
menunjukkan dua indikator bersaudara yang **teksnya sama** dan hanya berbeda nomor:

```
(1) Jumlah Dokumen Hasil Pengelolaan Pelayanan Kesehatan Orang dengan Masalah …
(2) Jumlah Dokumen Hasil Pengelolaan Pelayanan Kesehatan Orang dengan Masalah …
```

Membersihkan nomor membuat keduanya **identik** → `ON DUPLICATE KEY UPDATE` menggabungkannya →
satu indikator **hilang** beserta target/realisasinya, **tanpa satu galat pun**. Ini persis jenis
kegagalan diam-diam yang harus dicegah.

Aturan yang diusulkan:

- **Bintang**: selalu boleh dibuang saat impor. Tidak memengaruhi kunci.
- **Nomor**: dibuang hanya bila hasilnya **unik** di dalam `(tahun, level)` pada set yang sedang
  diimpor. Yang bentrok **tetap bernomor** dan diberi catatan:
  `"Nomor (2) dipertahankan — tanpa nomor, indikator ini sama persis dengan (1) di level yang sama."`
- Ringkasan di modal menyebut angkanya: `37 bintang dibuang · 12 nomor dibuang · 2 nomor dipertahankan`.
- Alternatif yang **ditolak** untuk sekarang: menyimpan nomor di kolom baru (butuh migrasi +
  mengubah kunci unik). Aturan unik di atas cukup dan bisa diuji tanpa skema baru.

Kunci unik di modul tujuan:

| Tabel | Kunci | Akibat pembersihan |
|---|---|---|
| `rencana_aksi` | `(tahun, level, indikator)` | nomor bisa menabrak → aturan §4 |
| `pk_sasaran` | tidak ada unique (index saja) | aman — replace-all per tahun |
| `pk_program` | `(tahun, program, kegiatan, subkegiatan)` | bintang bisa **menyatukan** baris kembar → `bulkInsert` gagal 1062 (500). Wajib dedup di layar/simpan + pesan "N baris digabung karena namanya sama setelah dibersihkan". |
| `iki` (RHK/indikator) | tidak ada unique nama | aman, isinya teks bebas |

---

## 5. Pintu yang harus ikut (L69: perbaikan belum selesai sampai semua pintu kena)

| # | Pintu | Sekarang | Sesudah |
|---|---|---|---|
| 1 | Impor Renaksi — `step=preview` | `sanitize` saja | bersih + catatan per baris + ringkasan |
| 2 | Impor Renaksi — `step=commit` | percaya baris preview | bersih ulang di server + aturan unik §4 + **pencocokan induk ikut membuang bintang** (§11.2) |
| 3 | Data Entry (ketik manual) — `upsertRencanaAksi` | hanya `trim` | buang bintang di ujung; nomor **tidak** disentuh (orang mengetik sendiri; nomor bisa disengaja) |
| 4 | PK Master Sasaran — `GET …/sasaran/import-renaksi` | verbatim | bersih (program/kegiatan/sub + indikator) |
| 5 | PK Master Program — `GET …/program/import-renaksi` | `.trim()` | bersih + dedup `pk_program` |
| 6 | IKI — `GET /api/iki/import-renaksi` | verbatim | bersih (`rhk` dan `indikator`) |
| 7 | Simpan PK & IKI (`POST …/sasaran`, `…/program`, iki) | Zod `trim` | bersih juga (supaya ketikan manual/API lain ikut) |
| 8 | E-Anggaran **Init Renaksi** | `buangBintang` | pakai helper bersama (bintang saja — Init tidak memakai indikator) |
| 9 | **Data lama** Renaksi & PK/IKI yang sudah tersimpan | tidak ada alat | tombol **Rapikan Nama** per tahun (pratinjau → tulis → audit) |

### 5.9 Tombol "Rapikan Nama" (data lama)

- **Pratinjau (`dry`) dulu**: jumlah baris tersentuh, 10 contoh sebelum→sesudah, daftar bentrok
  yang **tidak** akan dibersihkan (nomor dipertahankan), dan jumlah baris `pk_program` yang akan
  digabung.
- Renaksi: menulis dalam **satu transaksi**, `version = version + 1`, `updated_at = updated_at`
  (label bukan suntingan isi), audit `RA_RAPIKAN_NAMA`.
- **Wajib memakai penjalaran ganti nama** (`jalarkanGantiNama`, T16): membersihkan
  nama induk sendirian justru memutus hierarki — anak-anaknya tetap menunjuk nama berbintang.
  Fungsi ini **belum ada di commit mana pun** (lihat §11.1).
- Pagar yang sama dengan fitur lain modul: `bolehEditMenu('rencana_aksi')` / peran PK-nya,
  rate limit, dan konfirmasi menyebut jumlah baris.
- Nomor `(n)` pada data lama **tidak** dibuang dari DB bila bentrok (§4); yang tidak bentrok boleh.

---

## 6. Cetak & laporan — harga dari "bintang dibuang dari DB"

Hari ini bintang ikut tercetak karena ia ada di dalam nama (`exports.ts` menulis `r.program`,
`r.kegiatan`, `r.sub_kegiatan` apa adanya; `cetak-filter`/`renaksi-cetak` sama). Kalau bintang
dibuang dari DB, dokumen resmi kehilangan penanda tingkatnya kecuali **Cetak menempelkannya
sendiri**:

- `bintangLevel(level)` → `*`…`*****`, ditempel di tampilan Cetak/PDF/Excel saja.
- Nomor indikator diturunkan dari **urutan** indikator di dalam entitas induk saat dicetak.
- Ini satu-satunya cara memenuhi "upload langsung bersih" tanpa kehilangan format resmi. Kalau
  Cetak tidak mau disentuh, alternatifnya: **jangan** buang di DB, cukup di tampilan PK/IKI —
  tetapi itu tidak memenuhi permintaan pertama.

---

## 7. Batas yang disadari

- Bintang/tanda yang **bagian sah** sebuah nama tidak disentuh (hanya ujung kanan / awalan nomor).
- Indikator kembar yang jadi identik: nomor dipertahankan; menggabungkannya adalah keputusan
  manusia, bukan efek samping impor.
- Pembersihan **per tahun**; tahun lain tidak ikut.
- Dokumen yang sudah dicetak/diarsipkan (PK final, LKJIP final) tidak disunting — hanya data hidup.
- Data lama baru bersih setelah tombol Rapikan dijalankan; tidak ada penulisan diam-diam.
- Impor mode `ganti` yang menghapus level tertentu tetap tunduk Kunci Periode seperti sekarang.

---

## 8. Uji yang harus ada sebelum dianggap selesai

1. `scripts/test-nama-resmi.mts` (PURE): idempoten, bintang tengah, `(n)` awalan vs tengah,
   nama kosong, spasi ganda, unicode/NBSP.
2. `scripts/test-renaksi-import.mjs` (fixture matriks berbintang + `(1)`/`(2)`): preview bersih,
   **dua indikator kembar tetap dua baris**, ringkasan hitungan benar.
3. Uji statis pemanggilan helper di 4 route PK/IKI + `lib/data/kinerja.ts` (Init Renaksi).
4. Uji DB tahun kotak pasir: Rapikan Renaksi memakai jalur T16 (anak ikut), `version` naik,
   `updated_at` tetap, `pk_program` dedup melaporkan jumlah yang digabung.
5. Uji mutasi: menghapus pemanggilan helper di satu pintu harus membuat uji gagal.

---

## 9. Urutan pengerjaan yang disarankan

1. Helper PURE + uji (tanpa menyentuh perilaku).
2. Impor Renaksi: preview + commit + aturan unik + ringkasan di modal.
3. PK/IKI: tarik + simpan + dedup `pk_program`.
4. Rapikan Nama per tahun (Renaksi dulu, memakai T16; lalu PK/IKI).
5. Cetak: tempel bintang/nomor dari level & urutan (opsional, hanya bila format resmi dibutuhkan).

---

## 10. Pertanyaan yang perlu diputuskan pemilik sebelum tahap 2

1. Bintang & nomor **juga hilang dari dokumen Cetak Renaksi** (dokumen resmi), atau hanya dari data
   dan dari PK/IKI? Kalau hilang, Cetak wajib menempelkannya sendiri (§6).
2. Indikator kembar yang jadi identik sesudah nomor dibuang: **pertahankan nomor** (usulan §4) atau
   **gabungkan** jadi satu baris?
3. Apakah data lama cukup dibereskan lewat tombol Rapikan, atau perlu sekali jalan otomatis saat
   tahun dibuka?

---

## 11. Hasil pemeriksaan 11 Nov 2026

Klaim konsep dicocokkan dengan kode dan data Renaksi 2026 (basis data pengembangan, hanya dibaca).

**Terbukti benar:**

- 47 baris; **semua 47 indikator berakhiran bintang**, 15 bernomor `(n)`.
- Kolom `program` ikut berbintang di semua baris, karena untuk level tujuan/sasaran kolom itu berisi nama barisnya sendiri.
- Kunci unik sesuai §4: `rencana_aksi (tahun, level, indikator)`, `pk_program (tahun, program, kegiatan, subkegiatan)`, `pk_sasaran` tanpa kunci unik.
- Parser memakai `(n)` di `lib/renaksi/import-renaksi.ts:477` dan `:482`. `buangBintang` ada di `lib/kinerja/master-nama.ts:26`.

### 11.1 Ketergantungan yang belum ada

`jalarkanGantiNama` dan `lib/renaksi/ganti-nama.ts` hanya ada di pekerjaan Renaksi yang **belum di-commit** (berkas 10 Nov, bersama perubahan di `lib/data/rencana-aksi.ts`, `DataEntryForm.tsx`, `scripts/test-renaksi-audit.mjs`). Fungsinya juga tidak diekspor. Tombol Rapikan Nama (§5.9) baru bisa dikerjakan sesudah pekerjaan itu selesai dan di-commit, lalu fungsinya diekspor atau Rapikan ditulis di berkas yang sama.

### 11.2 Impor berkas bersih ke tahun yang masih berbintang

`commitImportRenaksi` (`lib/renaksi/import-data.ts:163–175`) memeriksa induk lewat `norm`, yang hanya mengecilkan huruf dan merapatkan spasi. Impor berkas yang sudah dibersihkan ke tahun yang datanya masih berbintang akan mencari `program x`, padahal di basis data tertulis `program x ***`. Semua kegiatan dan sub kegiatan lalu **ditahan** dengan alasan "belum ada di tahun …".

Perbaikannya: pembanding induk memakai helper yang sama (`rapikanNamaEntitas`) di kedua sisi. Menjalankan Rapikan lebih dulu tidak cukup sebagai satu-satunya jalan, sebab orang bisa mengimpor sebelum menekan Rapikan.

### 11.3 Tabrakan nomor di data sekarang

Membuang nomor dari 15 indikator bernomor di 2026 menghasilkan **0** tabrakan di `(tahun, level)`. Pasangan "(1)/(2) Jumlah Dokumen …" di tangkapan layar ternyata berbeda di bagian akhir teksnya. Aturan §4 tetap diperlukan untuk berkas lain, tetapi tidak menyentuh data 2026 yang ada.

### 11.4 Hubungan dengan PK

`docs/CONCEPT-pk-halaman-2-sesuai-pdf.md` §8: dokumen PK baru tanpa bintang bila pintu 4–5 (PK menarik dari Renaksi) dan Rapikan data PK lama sudah jalan. Urutan yang disarankan: helper + pintu 4–5 lebih dulu, lalu PK.

---

## 12. Yang dikerjakan (11 Nov 2026) — penanda dihitung, bukan disimpan

Keputusan pemilik: hasil cetak dan unduhan bersih seperti PK; penanda tetap ada di sistem supaya indikator kembar tidak bentrok; baris ketikan tangan mendapat penanda otomatis.

**Aturan** (`lib/shared/nama-resmi.ts`, murni)

- Teks tersimpan tidak diubah. Setiap tampilan membuang penanda yang tersimpan, lalu menempelkan penanda yang **dihitung** bila layarnya memang menampilkannya. Karena selalu dibuang dulu, penanda tidak pernah menumpuk.
- Bintang dihitung dari tingkat (`bintangLevel`).
- Nomor (`nomorIndikator`): nomor yang tersimpan dipertahankan, jadi hasil impor tetap bernomor seperti berkasnya. Indikator tanpa nomor mendapat nomor kosong berikutnya menurut abjad. Entitas berindikator tunggal tanpa nomor tersimpan tidak dinomori. Renaksi tidak punya kolom urutan, jadi inilah satu-satunya urutan yang tersedia.

**Di mana berlaku**

| Tempat | Tampilan |
|---|---|
| Cetak Renaksi: layar, PDF, Excel | bersih; sakelar **Penanda matriks** menempelkan penanda hasil hitungan |
| Unduhan lain: daftar per level, per indikator, lembar Matriks Bulanan | bersih |
| Layar kerja: Data Entry, pemilih & kartu indikator, Matriks Bulanan, modal detail/reset | selalu berpenanda (hasil hitungan) |
| Tabel LKJIP tertaut ke Cetak Renaksi | bersih (memakai penyusun Cetak yang sama) |
| IKI | bersih saat ditarik dari Renaksi dan saat dicetak (STANDAR/DIREKTUR) |
| PK | sudah bersih (konsep PK §12) |

Cetak membersihkan paling akhir (`pasangTampilan` di `cetak-filter.ts`): fokus dan penyusunan pohon tetap mencocokkan nama mentah.

**Yang gugur dari rancangan awal**

- Pembersihan saat impor dan saat simpan (pintu 1–3), tombol Rapikan Renaksi (pintu 9), dan ketergantungan pada T16 (§11.1): tidak diperlukan karena data tidak ditulis ulang.
- §11.2 (impor berkas bersih ke tahun berbintang menahan anak-anaknya) **masih berlaku dan belum dibereskan**: pencocokan induk di `commitImportRenaksi` tetap membandingkan nama mentah.

**Batas**

- Indikator kembar terbaca sama persis di cetakan bersih. Diterima pemilik.
- Tabel LKJIP yang sudah tertaut ke Cetak Renaksi akan melapor "data berubah" sekali saat Perbarui.
- Cetak IKI membuang awalan `(1)` dan bintang di ujung dari RHK/indikator apa pun, termasuk yang diketik sendiri. IKI varian CUSTOM tidak dibersihkan saat dicetak (isinya sel bebas); yang bersih hasil tariknya.
- Isian form Data Entry tetap teks tersimpan. Penanda hanya tampil di daftar.

**Bukti**

- `npx tsx scripts/test-renaksi-penanda.mts`: 48 pemeriksaan; uji mutasi 18 dari 18 tertangkap.
- Layar (akun dummy, 2026 hanya dibaca): Cetak 47 baris bersih 0 bintang; sakelar menyala 94 bintang dan 21 nomor; Data Entry Program menampilkan `(1)`–`(4)` dan bintang.
- Belum diuji di layar: berkas PDF/Excel hasil unduhan, Matriks Bulanan, modal detail, layar IKI.
