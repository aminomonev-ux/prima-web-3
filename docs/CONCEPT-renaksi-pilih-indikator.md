# Konsep — Rantai pilihan berindikator di Data Entry Renaksi

Status: **konsep, belum dikerjakan.** Arah disetujui pemilik 12 Nov 2026; bab §9 dan §10 ditambahkan
sesudah pemeriksaan lanjutan di hari yang sama.

Keputusan pemilik:

1. Indikator induk yang dipilih **disimpan sebagai penentu baris** (kolom baru), bukan sekadar
   penyaring di layar.
2. 47 baris lama **dibiarkan kosong**, terisi saat baris itu diedit.
3. Indikator entitas baru **boleh diketik**, langsung masuk daftar pilihan.
4. **Duplikasi tahun ikut membawa tautan** — tahun depan tidak boleh harus dipetakan ulang manual.

---

## 1. Alur yang diminta

Pilihan berantai: memilih induk → memilih indikator induk → **daftar anak menyusut** mengikuti
indikator itu → memilih anak → memilih indikator anak. Tiap tingkat tetap punya indikatornya
sendiri; yang belum ada hari ini adalah **tautan** antara sebuah baris anak dan indikator induk
yang dijabarkannya.

Contoh nyata dari data 2026 (satu program, 4 indikator):

```
Program   : PROGRAM PEMENUHAN UPAYA KESEHATAN PERORANGAN …
Indikator : (2) Persentase Penyediaan Fasilitas Alat Kesehatan Alat Penunjang Medik …
Kegiatan  : Penyediaan Fasilitas Pelayanan Kesehatan Rujukan Tingkat Lanjutan …
Indikator : Persentase penyediaan alat kesehatan untuk mendukung pelayanan unggulan …
Sub       : Pengadaan Alat Kesehatan/Alat Penunjang Medik …
Indikator : Jumlah Alat Kesehatan/Alat Penunjang Medik Fasilitas Layanan Kesehatan …
```

| Tingkat | Induk | Indikator induk (baru) | Nama entitas | Indikator sendiri |
|---|---|---|---|---|
| tujuan | — | — | manual | manual (sumber kosakata) |
| sasaran | Tujuan | **pilih** | manual | pilih dari milik sasaran itu + tulis baru |
| program | Sasaran | **pilih** | manual | pilih dari milik program itu + tulis baru |
| kegiatan | Program | **pilih** | pilih, disaring indikator program | pilih dari milik kegiatan itu + tulis baru |
| sub-kegiatan | Program → Kegiatan | **pilih 2×** (indikator program & indikator kegiatan) | manual | pilih dari milik sub itu + tulis baru |

---

## 2. Apa yang sudah ada, apa yang belum

**Sudah ada** (`_components/DataEntryForm.tsx`): Tujuan/Sasaran/Program/Kegiatan sudah dropdown
induk, dan Kegiatan di level sub sudah disaring berdasarkan Program (`filteredKegiatans`).
Indikator di semua tingkat masih `<input type="text">`. Daftar induk pun hanya menyimpan nama
(`setParentTujuans(new Set(tujuans.map(r => r.program)))`), jadi barisnya dibuang sebelum
indikatornya sempat dipakai.

**Belum ada**: kolom yang mencatat *"baris ini penjabaran indikator induk yang mana"*.

---

## 3. Kolom baru: `induk_indikator_id`

```sql
ALTER TABLE rencana_aksi
  ADD COLUMN induk_indikator_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Soft-FK rencana_aksi.id — baris indikator induk yang dijabarkan baris ini (NULL = belum diisi, data lama)',
  ADD INDEX idx_ra_induk_indikator (tahun, induk_indikator_id);
```

**Menunjuk `id`, bukan teks indikator:**

1. Indikator induk bisa berganti nama; hierarki nama (T16) menulis ulang seluruh turunannya.
   Tautan id tidak ikut bergeser.
2. Satu entitas punya beberapa baris indikator yang teksnya bisa mirip; teks tidak cukup membedakan.
3. Soft-FK tanpa `FOREIGN KEY` — pola tabel ini dan L68 (keberadaan induk diperiksa di jalur tulis).

Tautan **satu tingkat saja**; rantai penuh dinaiki lewat kolom ini berulang
(sub → kegiatan → program → sasaran → tujuan). **Tidak masuk kunci unik apa pun.**
`uk_tahun_level_ind (tahun, level, indikator)` tidak disentuh.

---

## 4. Urutan isian per tingkat

Berlaku mulai `sasaran`; `tujuan` tetap manual penuh.

**sasaran**: Tujuan (ada) → **Indikator Tujuan** → Sasaran (teks) → Indikator Sasaran (milik
sasaran itu + tulis baru)
**program**: Sasaran (ada) → **Indikator Sasaran** → Program (teks) → Indikator Program
**kegiatan**: Program (ada) → **Indikator Program** → Kegiatan (dropdown, **disaring**) →
Indikator Kegiatan
**sub-kegiatan**: Program → **Indikator Program** → Kegiatan (disaring) → **Indikator Kegiatan** →
Sub Kegiatan (teks) → Indikator Sub Kegiatan

`induk_indikator_id` = id baris yang dipilih pada langkah **indikator induk**; `indikator` = nilai
langkah **indikator sendiri**.

Aturan perilaku (semuanya pernah jadi bug di modul ini):

- Pilihan indikator induk **mati sampai induknya dipilih** (pola Kegiatan yang mati sampai Program dipilih).
- Mengganti induk mengosongkan indikator induk & daftar anak, tetapi **tidak** menghapus teks yang
  sudah diketik sendiri.
- Pilihan yang tidak ada di daftar (baris lama / tautan usang) **tetap ditampilkan sebagai
  pilihannya sendiri** — kalau tidak, buka Edit lalu Simpan mengubah data tanpa ada yang mengetik.
- Tiap opsi menyebut pemakainya bila sudah dipakai baris lain. Ini membuat tabrakan terlihat
  **sebelum** disimpan.
- Komponen: `SoftSelect` + satu baris input teks untuk "tulis baru". Tidak ada komponen baru,
  tidak ada endpoint baru (opsi dari `GET /api/rencana-aksi` yang sudah dipanggil form) → nol
  permukaan sakelar maintenance baru (L72).

---

## 5. Aturan penyaringan — dan artinya untuk data lama

```
level = 'kegiatan' AND program = <program terpilih>
AND (induk_indikator_id = <id indikator program terpilih> OR induk_indikator_id IS NULL)
```

Suku `OR … IS NULL` **syarat mutlak**: seluruh 47 baris 2026 dan 5 baris 2040 punya tautan kosong.
Tanpa suku itu, semua kegiatan lama lenyap dari pilihan begitu fitur rilis, dan tidak ada yang bisa
disunting tanpa memetakan setahun penuh lebih dulu.

Konsekuensi yang disadari: selama transisi, satu entitas yang sebagian barisnya sudah tertaut akan
muncul di lebih dari satu indikator induk. Daftar menyusut bertahap seiring baris diedit.

---

## 6. Aturan simpan & pagar server

### 6.1 Tegas: wajib dari layar, boleh kosong di data

| Konteks | `induk_indikator_id` | Sebab |
|---|---|---|
| Baris **baru** dari layar, level sasaran–sub-kegiatan | **WAJIB** | urutan isiannya memang begitu; tanpa tautan, penyaringan anak tidak punya dasar |
| Baris level `tujuan` | tidak berlaku | tidak punya induk |
| Mengedit baris **lama** yang tautannya kosong | **tidak dipaksa** | "perbaiki satu angka" tidak boleh berubah jadi "petakan setahun"; pemilihnya tetap tampil, dan begitu dipilih ikut tersimpan |
| Impor berkas (semua mode) | boleh `NULL` | berkas tidak memuat tautan; kolom tidak ikut ditulis |
| Duplikasi tahun | ikut tautan asal; `NULL` hanya bila asalnya juga `NULL` | §9 |

"Wajib di layar, tidak wajib di API" di sini **bukan** pelanggaran L82: `NULL` bukan keadaan
berbahaya, melainkan keadaan sah yang hari ini dimiliki 52 baris. Yang dijaga server adalah bila
kolomnya **diisi** — harus ada, satu tahun, satu tingkat di atas baris, dan cocok dengan nama
induknya. Baris baru dari API tanpa tautan tetap sah, dan memang itulah bentuk data lama.

| Aturan | Di mana |
|---|---|
| Tautan harus ada, `tahun` sama, `level` = satu tingkat di atas baris | skema + cek eksistensi di jalur tulis (L68) |
| Induk yang dipilih harus cocok dengan nama induk di kolom baris — mencegah tautan silang | jalur tulis |
| `NULL` tetap diizinkan di API (impor tidak membawa tautan) | skema |
| Mengedit tidak boleh menghapus tautan oleh pemanggil yang tidak mengirim kolom itu | nilai tak dikirim → kolom tak disentuh (`COALESCE`/absen dari daftar) |
| Hapus baris yang masih ditunjuk baris lain → tolak dengan jumlahnya | perluas `assertTidakPunyaAnak` (`lib/data/rencana-aksi.ts:492`) |

Kenapa pagar hapus wajib: penjaga yang ada berbasis **nama** — hanya menolak kalau baris yang
dihapus adalah baris **terakhir** pemikul nama itu (`sisa === 0 && anak > 0`). Program ber-4
indikator: menghapus indikator ke-2 lolos (`sisa = 3`), padahal mungkin ada kegiatan yang
menunjuknya lewat id. Tanpa pagar baru, tautannya jadi hantu — soft-FK tidak menolak apa pun.

---

## 7. Migrasi

`docs/migrations/migration-renaksi-induk-indikator.sql` + kolom didaftarkan di `docs/schema-mysql.sql`.

- Satu `ALTER TABLE`, satu kolom nullable, satu index. **Tanpa backfill, tanpa UPDATE data.**
- Uji di tahun kotak pasir: jumlah baris sebelum = sesudah,
  `SELECT COUNT(*) … WHERE induk_indikator_id IS NOT NULL` = 0.

---

## 8. Dampak ke data yang sudah tersimpan

**Tidak ada satu angka pun yang ditulis ulang.** Target RPJMD/tahunan, `q*_target`,
`q*_realisasi`, `bulan_target/realisasi`, `anggaran_nominal`, `jenis`, `satuan`, `version` tidak
disentuh.

| Hal | Dampak |
|---|---|
| 47 baris 2026 + 5 baris 2040 | tautan `NULL`; baris & angka tetap; ikut tampil di semua pilihan (§5) |
| Mengedit baris lama | tautan terisi saat Simpan; `version` naik seperti edit biasa |
| Kunci unik `(tahun, level, indikator)` | **tidak berubah**; dropdown hanya menawarkan milik entitas itu + teks baru |
| Impor `tambah`/`upsert` | berkas tak membawa tautan → kolom tak ikut ditulis, tautan lama utuh |
| Impor `ganti` | menghapus baris satu tingkat → tautan anak yang menunjuk baris terhapus **di-`NULL`-kan di transaksi yang sama** (§9) |
| Ganti nama & pindah induk (T16/H) | tidak berubah, malah lebih aman: tautan id tidak bergeser |
| Duplikasi tahun | **ikut tertaut** — lihat §9 |
| Cetak/PDF/Excel, Matriks Bulanan, Realisasi, Reset | tidak berubah |

---

## 9. Duplikasi tahun ikut menautkan (keputusan #4)

`duplicateYear` (`lib/data/rencana-aksi.ts:881`) sekarang satu `INSERT … SELECT`. Id tidak ikut
disalin, jadi tautan **tidak boleh** disalin mentah (akan menunjuk baris tahun asal). Pemetaan
id lama → id baru tidak bisa dilakukan baris-per-barish di dalam satu statement.

Solusinya tiga langkah, semuanya di **transaksi & kunci `RA_DUPLIKASI` yang sama**:

```sql
-- 1. salin semua baris; kolom tautan IKUT tersalin (id lama, sementara)
INSERT INTO rencana_aksi (tahun, level, kode, …, bulan_target, induk_indikator_id, created_by, updated_by)
SELECT ${ke}, level, kode, …, bulan_target, induk_indikator_id, ${userId}, ${userId}
FROM rencana_aksi WHERE tahun = ${dari};

-- 2. pindahkan tautan ke salinan induknya di tahun baru, lewat pasangan (level, indikator)
UPDATE rencana_aksi AS anak
JOIN rencana_aksi AS induk_asal ON induk_asal.id = anak.induk_indikator_id
JOIN rencana_aksi AS induk_baru ON induk_baru.tahun = ${ke}
                              AND induk_baru.level = induk_asal.level
                              AND induk_baru.indikator = induk_asal.indikator
SET anak.induk_indikator_id = induk_baru.id
WHERE anak.tahun = ${ke} AND anak.induk_indikator_id IS NOT NULL;

-- 3. sisa tautan yang induknya tidak punya salinan (data lama yatim) dilepas
UPDATE rencana_aksi SET induk_indikator_id = NULL
WHERE tahun = ${ke} AND induk_indikator_id IS NOT NULL
  AND induk_indikator_id NOT IN (SELECT id FROM (SELECT id FROM rencana_aksi WHERE tahun = ${ke}) AS s);
```

Kenapa pasangan `(level, indikator)` sah sebagai penghubung: `uk_tahun_level_ind` menjamin satu
baris per pasangan itu di satu tahun. **Kalau kunci itu kelak diubah, UPDATE ini wajib ikut** —
dicatat di komentar fungsi.

Sifat yang menguntungkan: baris yang di tahun asal tautannya kosong tidak ikut ter-UPDATE
(JOIN gugur) → tetap `NULL`; tautan yang induknya tidak punya salinan di tahun baru ikut dilepas
langkah 3, jadi tidak ada id mati yang menyeberang. Tahun tujuan tetap harus kosong seperti
sekarang, jadi tidak ada risiko menimpa.

Biaya: dua statement tambahan, join ber-index pada tabel yang sudah dibatasi satu tahun.

**Koreksi saat mengerjakan (jujur):** rancangan awal di atas menulis "kolom tautan sengaja TIDAK
ikut" di langkah 1, dan itu justru mustahil ditindaklanjuti — `UPDATE` langkah 2 tidak punya bahan
apa pun untuk di-join karena semua salinan `NULL`. Uji tahap 5 menangkapnya (7 dari 12 gagal
dengan tautan kosong semua). Perbaikannya: kolom **ikut** tersalin di langkah 1 lalu dipindahkan
di langkah 2, dan langkah 3 ditambahkan untuk membuang tautan yatim.

---

## 10. Dampak ke modul yang mengambil data Renaksi

Semua pembaca saya periksa satu per satu. **Tidak ada yang perlu diubah, dan tidak ada yang
berisiko** — dengan tiga alasan yang berlaku serentak:

1. **Semua membaca kolom eksplisit**, tidak ada `SELECT *` dari `rencana_aksi`. Menambah kolom
   tidak mengubah bentuk data yang mereka terima.
2. **Tidak ada yang menulis** ke `rencana_aksi` selain `lib/data/rencana-aksi.ts` dan
   `lib/renaksi/import-data.ts` — jadi tidak ada pintu sunting di luar Renaksi yang bisa
   mengosongkan tautan.
3. **Tidak ada yang memakai indikator sebagai identitas baris.** Yang dipakai: nama entitas,
   teks indikator (sebagai isi), target, atau `id`.

| Modul | Yang dibaca | Sumber | Aman? |
|---|---|---|---|
| E-Anggaran — Init Renaksi | `level, program, kegiatan, sub_kegiatan` | `lib/data/kinerja.ts:223` | ✅ |
| E-Anggaran — spanduk "Renaksi berubah" | kolom yang sama + `renaksi_ganti_nama` | `lib/data/kinerja-master-ubah.ts:87,343,353` | ✅ |
| E-Anggaran — banding | `lib/kinerja/banding-renaksi.ts` (nama & jalur) | — | ✅ |
| PK — Master Sasaran | `level, sasaran, outcome_*, program, kegiatan, sub_kegiatan, indikator, satuan, target_tahunan` | `app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts:52` | ✅ |
| PK — Master Program | `level, program, kegiatan, sub_kegiatan` | `…/program/import-renaksi/route.ts:59` | ✅ |
| PK — banding/spanduk | sama + `indikator`, `outcome_*`, `target_tahunan` | `…/banding-renaksi/route.ts:37` | ✅ |
| IKI — impor/tarik RHK | `id, level, sasaran, tujuan, outcome_*, program, kegiatan, sub_kegiatan, indikator, jenis, satuan, target_tahunan, q*_target` | `app/api/iki/import-renaksi/route.ts:74` | ✅ |
| IKI — pantau & banding | perbandingan isi kartu lewat `iki_rhk.renaksi_id` | `app/(dashboard)/iki/_lib/banding-renaksi.ts` | ✅ |
| LKJIP — sumber "Renaksi · Cetak" | seluruh baris lewat API Renaksi, lalu disusun jadi pohon **berdasarkan nama entitas** | `lib/lkjip/sumber/renaksi-cetak.ts` | ✅ |
| Rima — query Renaksi | agregat `COUNT`/`SUM` per tahun/jenis | `lib/rima/rencana-aksi-provider.ts:38,53,62` | ✅ |
| Penghitung pemakai | jumlah entri E-Anggaran/PK/IKI per **nama** | `lib/data/renaksi-pemakai.ts` | ✅ |

Catatan yang perlu disadari, semuanya **bukan** akibat fitur ini:

- IKI dan LKJIP memakai **`id` baris** (`iki_rhk.renaksi_id`, kunci `ra:<id>`), dan tautan itu
  selalu **di dalam satu tahun**: dokumen IKI/LKJIP tahun 2027 dibuat dari Renaksi 2027 dan
  menunjuk id 2027 — justru id baru hasil duplikasi itulah yang benar dipakai. Tidak ada dokumen
  yang perlu menyeberang tahun, dan tidak ada yang berubah di sini.
- Impor mode `ganti` menghapus baris satu tingkat **di tahun yang sama**; kartu IKI tahun itu yang
  menunjuk baris terhapus jadi yatim. Perilaku lama, di luar lingkup konsep ini.
- PK Master Sasaran & Master Program **menggabungkan** banyak baris indikator jadi satu entitas,
  jadi jumlah baris indikator tidak mempengaruhi hasil tarik. Fitur ini tidak menambah/mengurangi
  baris.

Kesimpulan: PK, IKI, E-Anggaran, LKJIP, dan Rima aman tanpa satu baris pun diubah di sisinya.

---

## 11. Pintu yang wajib ikut (L69)

| # | Pintu | Berkas | Perubahan |
|---|---|---|---|
| 1 | Data Entry simpan | `DataEntryForm.tsx`, `lib/data/rencana-aksi.ts` | urutan isian + kolom tautan |
| 2 | Mode Edit | sama | pilihan tersimpan di luar daftar tetap ditampilkan |
| 3 | Impor commit | `lib/renaksi/import-data.ts` | `NULL`-kan tautan saat mode `ganti`; kolom tidak ditulis di mode lain |
| 4 | Duplikasi tahun | `duplicateYear` | langkah 2 (§9) |
| 5 | Hapus baris | `assertTidakDitunjuk` | pagar tautan by id |
| 6 | Skema & migrasi | `docs/schema-mysql.sql`, `docs/migrations/` | kolom + index |
| 7 | Tipe baris | `lib/data/rencana-aksi.ts` **dan** `app/(dashboard)/rencana-aksi/_lib/types.ts` | dua salinan `RaRow`; keduanya wajib, kalau tidak `tsc` lolos tapi layar buta |

---

## 12. Urutan tahap pengerjaan

Tiap tahap selesai sendiri: diuji, lalu di-commit. Tahap 1 sengaja tidak mengubah perilaku sama
sekali, supaya migrasi bisa dipasang lebih dulu di server kantor tanpa menunggu layar.

| Tahap | Isi | Selesai bila |
|---|---|---|
| **1** | Migrasi kolom `induk_indikator_id` + index; daftar kolom di `docs/schema-mysql.sql`; kolom di `RaRow` server & klien + `SELECT`-nya | `node scripts/check-schema.mjs` sinkron, `tsc` hijau, 52 baris tetap `NULL`, tidak ada perilaku berubah |
| **2** | Aturan MURNI rantai (`lib/renaksi/rantai.ts`): daftar indikator induk untuk induk terpilih, daftar anak yang cocok (termasuk aturan "`NULL` ikut tampil"), pemisahan "milik entitas ini" vs "milik entitas lain" | uji PURE tanpa DB: induk kosong, anak `NULL`, dua induk berbeda, entitas tanpa indikator |
| **3** | Layar Data Entry: urutan isian per tingkat, pemilih indikator induk & indikator sendiri, wajib untuk baris baru (§6.1), mode Edit menampilkan nilai tersimpan di luar daftar | coba di peramban tahun kotak pasir: alur program → indikator → kegiatan menyusut; baris lama tetap bisa disunting |
| **4** | Pagar sisa: hapus induk yang masih ditunjuk (by id), impor mode `ganti` me-`NULL`-kan tautan anak | uji DB: hapus induk tertaut ditolak, `ganti` tidak meninggalkan tautan hantu |
| **5** | Duplikasi tahun menautkan ulang (§9) — bagian impor `ganti` sudah dikerjakan di tahap 4 | uji DB 2098 → 2099: salinan tertaut ke baris 2099; `ganti` tidak meninggalkan tautan hantu |
| **6** | Regresi + uji mutasi (§14) + coba layar penuh (tema terang, 375 px, Esc) | seluruh uji §14 hijau |

**Tahap 1 selesai** (12 Nov): `migration-renaksi-induk-indikator.sql` (kolom + index, tanpa
backfill), terdaftar di `docs/schema-mysql.sql`, kolom ikut di `RaRow` server & klien beserta kedua
`SELECT`-nya. Terpasang di DB `prima_db_3`: 52 baris tetap, 0 tertaut; `check-schema` SINKRON,
`tsc` hijau.

**Tahap 2 selesai** (12 Nov): `lib/renaksi/rantai.ts` (MURNI) — `INDUK_LEVEL`, `namaEntitas`,
`namaIndukLangsung`, `indikatorInduk`, `entitasAnak` (baris bertaut `NULL` ikut tampil),
`indikatorEntitas`, `pemakaiIndikator`, `denganNilaiTersimpan`. Uji
`npx tsx scripts/test-renaksi-rantai.mts` (33). Catatan jujur: tiga ekspektasi uji pertama salah
saya tulis sendiri — di level program, indikator induknya milik **sasaran**, bukan program;
modulnya benar, ujinya yang dibetulkan.

**Tahap 3 selesai** (12 Nov): rantai pilihan terpasang di `DataEntryForm.tsx` — urutan isian per
tingkat, pemilih indikator induk (mati sampai induknya dipilih), indikator sendiri sebagai dropdown
milik entitas itu + “tulis baru”, kegiatan di level sub disaring oleh indikator program, dan baris
lama yang tautannya kosong tetap bisa disunting. Tautannya kini **disimpan**: kolom masuk
`UpsertRencanaAksiSchema`, `INSERT`/`UPDATE` menulisnya, `ON DUPLICATE KEY` memakai `COALESCE`
supaya pemanggil yang tidak mengirim kolom tidak mengosongkannya, dan `assertIndukIndikator`
menolak tautan beda tahun / beda tingkat / bukan induk baris itu (400 `INDUK_INDIKATOR_TIDAK_SAH`).
Karena itu simpan + validasi naik ke tahap ini; tahap 4 tinggal pagar hapus dan impor `ganti`.
Uji mutasi baru: `scripts/test-renaksi-rantai-mutasi.mts` (6) membuang penjaga `NULL` dari salinan
modul dan membuktikan baris lama memang lenyap — jadi uji biasa tidak bisa lolos tanpa penjaga itu.
Bukti lain: uji DB kotak pasir 2099/2098 (8 — simpan, edit tanpa kolom, tiga penolakan), regresi
`test-renaksi-audit` (55), `test-renaksi-pindah-induk` (39), `test-renaksi-pemakai` (11), `tsc` &
`eslint` bersih. Catatan: perubahan ini sempat memunculkan satu peringatan
`react-hooks/exhaustive-deps` (karena `handleEdit` kini membaca baris induk); diperbaiki dengan
`useCallback` + dependensi yang jujur, bukan dengan `eslint-disable`.

**Tahap 4 selesai** (12 Nov): `assertTidakDitunjuk` memblokir hapus baris yang masih ditunjuk
`induk_indikator_id` (error `RaTautanAnakError` → 400 `MASIH_DITUNJUK`, pesannya menyebut jumlah
barisnya) — penjaga lama berbasis nama meloloskannya selama nama entitas itu masih dipikul baris
lain. Impor mode `ganti` melepas tautan anak di transaksi yang sama dengan penghapusannya, jadi
tidak tersisa id yang sudah tidak ada. Uji tetap: `scripts/test-renaksi-induk-indikator.mts` (16),
regresi `test-renaksi-audit` (55) / `pindah-induk` (39) / `pemakai` (11), `tsc` & `eslint` bersih.
Catatan jujur: satu ekspektasi uji saya salah tulis (B3) — menganggap indikator program LAIN selalu
salah, padahal dua indikator di program yang SAMA sama-sama sah jadi induk; ujinya saya betulkan
menjadi "program lain ditolak" + kontrol positif untuk yang sah.

**Tahap 5 selesai** (12 Nov): `duplicateYear` menyalin `induk_indikator_id` lalu memindahkannya ke
salinan induk di tahun baru (join lewat `(tahun, level, indikator)`), dan melepas tautan yang
induknya tidak ikut tersalin. Uji baru `scripts/test-renaksi-duplikasi-tautan.mts` (12): rantai penuh
2099 → 2098 tertaut ke id 2098 (bukan id 2099), tidak ada satu pun tautan menyeberang tahun, baris
lama tanpa tautan tetap `NULL`, tautan ke induk yang tidak ada dilepas jadi `NULL`. **Dua kesalahan
saya yang ditangkap uji ini**: (a) rancangan §9 menulis kolom tautan tidak ikut tersalin, padahal
tanpa kolom itu langkah relink tidak punya bahan — 7 dari 12 uji gagal sampai kolomnya diikutkan;
(b) uji "tautan yatim" pertama saya salah susun (induknya ternyata punya padanan `level+indikator`
di tahun baru, jadi ditautkan ulang — itu perilaku yang benar), lalu diganti dengan induk yang
benar-benar tidak ada. Jalur impor `ganti` sudah dikerjakan di tahap 4.

**Tahap 6 selesai** (12 Nov): regresi hijau — `test-renaksi-rantai` (33), `-rantai-mutasi` (6),
`-induk-indikator` (16), `-duplikasi-tautan` (12), `-duplikasi-mutasi` (7), `-pindah-induk` (39),
`-pemakai` (11), `-audit` (55), `-penanda` (71), `tsc` & `eslint` bersih. Butir §14 8b diuji
terpisah: `scripts/test-renaksi-duplikasi-mutasi.mts` menjadikan langkah relink no-op di salinan
modul lalu membuktikan pemeriksaan yang sama GAGAL pada mutan.

Uji layar penuh (tema terang, 375 px) **menemukan cacat nyata di luar modul ini**: dropdown
`SoftSelect` hanya bisa ditutup dengan klik di luar — Escape tidak melakukan apa pun, karena
efeknya cuma memasang `mousedown`. Diperbaiki di `components/ui/SoftSelect.tsx`: Escape menutup
da depan dan fokus kembali ke trigger (seperti `<select>` bawaan); sudah dicoba ulang di layar,
`aria-expanded` jadi `false` dan fokus kembali ke tombol. Tidak ada luapan horizontal di 375 px
(`scrollWidth` = `innerWidth` = 375) dan konsol halaman bersih dari error.

Yang tidak bisa dijalankan di sini: `scripts/test-renaksi-import.mjs` butuh berkas Excel kantor
(`D:/KANTOR/IKI 26/…xlsx`), jadi butir §14 7 untuk skrip itu belum dijalankan — jalur impor tetap
teruji lewat `test-renaksi-induk-indikator` D1–D3.

**Uji layar nyata** (12 Nov, peramban, tahun kotak pasir 2045): tujuan → sasaran → program (2
indikator) → kegiatan (satu per indikator) → sub kegiatan, semuanya lewat form. Yang terlihat:
pemilih indikator induk mati sebelum induknya dipilih; daftar kegiatan **menyusut** (hanya
"UJI KEGIATAN A" saat indikator program A dipilih, "…B" tidak muncul); kolom `induk_indikator_id`
terisi benar di DB (sasaran→tujuan, program→sasaran, kegiatan→program, sub→kegiatan); hapus
indikator program yang masih ditunjuk **ditolak** dengan pesan "masih ada 1 baris…" dan barisnya
utuh; hapus sub kegiatan (daun) tetap berhasil. Data 2045 dan akun uji dihapus lagi sesudahnya.

---

## 13. Yang sengaja tidak dikerjakan

- Tidak ada backfill otomatis / tombol "petakan semua" — keputusan #2.
- Tidak ada perubahan kunci unik, `rencanaGantiNama`, maupun `jalarkanGantiNama`.
- Tidak ada endpoint tulis baru, tidak ada sakelar maintenance baru.
- Level `tujuan` tetap manual sepenuhnya.
- Relasi ini tidak dipakai modul lain pada tahap ini (§10).

---

## 14. Uji minimal

1. **DB 2099** — `ALTER` di data berisi: jumlah baris tetap, semua tautan `NULL`.
2. Dua kegiatan di bawah satu program, satu tertaut ke indikator (1) dan satu ke (2): daftar
   menyusut sesuai pilihan; kegiatan lama yang `NULL` tetap muncul di kedua pilihan.
3. Simpan baris baru → tautan terisi id yang benar; simpan ulang tanpa mengirim tautan → tautan
   lama **tidak** terhapus.
4. Hapus indikator program yang masih ditunjuk kegiatan → ditolak dengan jumlah anaknya.
5. Impor `ganti` satu tingkat → tautan anak jadi `NULL`, bukan hantu.
6. **Duplikasi 2098 → 2099 dengan tautan lengkap**: salinan tertaut ke baris **2099**, bukan 2098;
   baris yang di asalnya `NULL` tetap `NULL`; jumlah baris sama; `q*_realisasi` kosong.
7. Regresi lama hijau: `test-renaksi-import.mjs`, `test-renaksi-penanda.mts`,
   `test-renaksi-audit.mjs`, `test-renaksi-pindah-induk.mts`, `test-renaksi-pemakai.mts`.
8. Uji mutasi: (a) membuang suku `OR induk_indikator_id IS NULL` → uji (2) gagal;
   (b) menyalin `induk_indikator_id` mentah di duplikasi → uji (6) gagal.

---

## 15. Batas

- Selama transisi, daftar anak menyusut hanya untuk bagian yang sudah diedit.
- Duplikasi hanya bisa ke tahun **kosong** (sifat lama), jadi tidak ada penggabungan tautan.
- Indikator tetap unik per `(tahun, level)`; dua entitas setingkat tidak bisa berbagi teks.
  Itu sifat tabel sejak migration 032, bukan efek fitur ini.
- Konsep ini belum menyentuh satu baris kode pun.
