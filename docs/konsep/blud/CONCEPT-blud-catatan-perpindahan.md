# CONCEPT — Catatan Perpindahan pada Pergeseran BLUD

> Status: **selesai** (2026-09-02). Regresi `npx tsx scripts/test-blud-catatan-perpindahan.mts`.
>
> **Dua hal berubah saat dikerjakan, keduanya karena membaca kodenya:**
>
> 1. Kuncinya `row_id`, **bukan `anggaran_key`** seperti tertulis di §5.
>    `ensureAnggaranKey` mencetak jangkar di SERVER saat Simpan, jadi baris yang
>    baru ditambahkan di layar belum punya jangkar untuk ditunjuk — catatannya
>    tidak akan bisa dibuat sampai dokumennya disimpan lebih dulu. `row_id`
>    adalah identitas baris di dalam versi, sama dengan yang sudah dipakai
>    `parent_id`, dan catatan ini memang foto per-versi.
> 2. **Salin dari Versi Lain melepas catatannya**, bukan membawanya (§6).
>    `SalinVersiModal` dipakai bersama layar DPA yang tidak punya catatan sama
>    sekali; menambahkan jalur khusus di sana berarti satu modal dengan dua
>    perilaku. Akibatnya cuma satu langkah tambahan — spanduk pintu 0 langsung
>    menawarkan mencatatnya.
> Lanjutan dari [CONCEPT-blud-uraian-geser.md](CONCEPT-blud-uraian-geser.md) dan
> [CONCEPT-blud-terapkan-uraian.md](CONCEPT-blud-terapkan-uraian.md).
> Mockup: artifact "Catatan Perpindahan" (tautannya di catatan sesi).

---

## 1. Masalahnya

Dokumen pergeseran hari ini menyimpan **keadaan tiap rekening** — pagu sebelum
dan pagu sesudah. Tidak ada satu kolom pun yang menyatakan uangnya berpindah
**dari mana ke mana**.

Akibatnya tiga hal, dan ketiganya sudah terasa:

**a. Uraian dua arah harus diketik tangan.** Dari Rp 80 juta ke Rp 113 juta
tidak ada cara menyimpulkan apakah itu "+45 −12", "+33", atau "+70 −37". Karena
itu kolom Bertambah/Berkurang lahir (L86) — dan karena itu pula ia harus dijaga
mati-matian dari `recalc` yang jalan tiap ketikan.

**b. Begitu pagunya berubah, uraiannya tidak bisa diperbaiki sendiri.** ATK
sudah diketik 45/12. Ternyata Perjalanan Dinas cuma sanggup 42, jadi pagunya
dibetulkan ke Rp 110 juta. Jawaban yang benar 42/12, tapi 45/15 juga memenuhi
`B − K = 30` **dan** membuat total dokumen tetap berimbang. Sistem tidak punya
dasar untuk memilih.

**c. Dokumennya tidak bisa menjawab "dari mana?"** Bahan Laboratorium bertambah
Rp 12 juta — dari siapa? Tidak ada berkas yang tahu. Itu pertanyaan pemeriksa,
bukan pertanyaan teori.

## 2. Yang ditambahkan

Satu baris = satu perpindahan.

| Dari | Ke | Nilai | Keterangan |
|---|---|---|---|
| Belanja Perjalanan Dinas Dalam Daerah | Belanja Alat Tulis Kantor | 42.000.000 | kegiatan batal |
| Belanja Alat Tulis Kantor | Belanja Bahan Laboratorium | 12.000.000 | reagen kurang |

Dari dua baris itu, seluruh kolom yang sekarang diketik tangan bisa **dihitung**:

| Rekening | Bertambah | Berkurang | Selisih | Pagu |
|---|---|---|---|---|
| Alat Tulis Kantor | 42.000.000 | 12.000.000 | +30.000.000 | 80 jt → 110 jt ✓ |
| Perjalanan Dinas | — | 42.000.000 | −42.000.000 | 100 jt → 58 jt ✓ |
| Bahan Laboratorium | 12.000.000 | — | +12.000.000 | 20 jt → 32 jt ✓ |
| **Total** | **54.000.000** | **54.000.000** | **0** | |

Tiga akibat yang langsung terasa:

1. **Kasus §1b berhenti jadi tebakan.** Perjalanan Dinas cuma sanggup 42?
   Ubah **satu baris perpindahan**. Uraian ATK ikut jadi 42/12 dengan
   sendirinya — sisi mana yang berubah sudah dinyatakan saat mengubahnya.
2. **Berimbang jadi sifat, bukan pemeriksaan.** Tiap perpindahan menyumbang
   angka yang sama ke kedua sisi, jadi `Σ Bertambah = Σ Berkurang` mustahil
   timpang. Hari ini keseimbangan itu baru ketahuan saat Simpan.
3. **Nilai kotor terbaca benar.** Tanpa catatan perpindahan dokumen berbunyi
   "yang berpindah Rp 42 juta"; yang sebenarnya berpindah Rp 54 juta. Selisih
   Rp 12 juta itu persis perpindahan yang lewat ATK.

## 3. Keputusan pokok: pagu tetap patokan

**Catatan perpindahan adalah PENJELASAN, bukan sumber angka.** Kedudukannya
persis seperti kolom Bertambah/Berkurang sekarang, cuma lebih kaya.

Kebalikannya — pagu dihitung dari catatan perpindahan — **ditolak**:
`pergeseran = Vol P × Harga P` itu angka yang dibaca sisi Realisasi sebagai
pagu (`SELECT … pergeseran AS pagu`). Membalik arahnya menggoyang seluruh modul
Realisasi, beserta pagar `kunciDanPeriksaPagu` yang menahan transaksi melebihi
pagu. Risikonya tidak sebanding dengan manfaatnya.

Konsekuensinya: tetap ada pemeriksaan pencocokan per rekening —

```
Σ masuk(rekening) − Σ keluar(rekening) = pergeseran − jumlah
```

Sama bentuknya dengan `periksaUraian` hari ini. Bedanya, kalau meleset pemakai
membetulkan **baris perpindahannya**, bukan menebak sisi mana yang salah.

## 4. Di mana fiturnya, dan bagaimana bentuknya

### 4.1 Tiga pintu, satu ruang

Ketiganya membuka **modal yang sama**. Dua tempat berbeda yang mengurus hal yang
sama adalah cara L78 lahir.

**Pintu 1 — tombol di bilah alat.** Sebaris dengan "Tutup Pergeseran" dan
"Salin Versi Lain":

```
[ Buat Pergeseran ] [ Sinkronkan DPA ] [ Tutup Pergeseran ] [ Salin Versi Lain ]
[ Catatan Perpindahan · 2 ]
```

Angka di belakangnya = jumlah perpindahan tercatat. Ini **jalan masuknya** —
dipakai saat orang memang duduk untuk menyusun pergeseran bulan itu.

**Pintu 0 — spanduk di atas tabel.** Muncul **sekali** ketika dokumen sudah
berimbang tapi belum punya catatan sama sekali. Ini yang membuat fiturnya
ditemukan orang; tanpa ini pemakai harus sudah tahu tombolnya ada.

```
2 rekening bergeser Rp 5.000.000, belum ada catatan perpindahannya.
                                  [Catat sekarang]  (Lewati dokumen ini)
```

"Catat sekarang" membuka modal yang **sudah berisi tebakan pasangannya** kalau
memang cuma ada satu yang turun dan satu yang naik. Menebak boleh **hanya**
kalau hasilnya tunggal DAN manusianya tetap menekan tombol; yang ditolak sejak
awal adalah menebak lalu menyimpannya diam-diam (§7).

"Lewati dokumen ini" mematikan pintu 0 **dan** pintu 2 untuk dokumen itu — satu
sakelar, dua tingkat. Catatan perpindahan tetap tidak wajib.

**Pintu 2 — spanduk di bawah barisnya.** Yang paling sering dipakai. Muncul di
baris yang pagunya sudah bergeser tapi belum ada catatan yang menjelaskannya:

```
Pergeseran Rp 30.000.000 di baris ini belum tercatat asalnya.  [Catat perpindahan]
Boleh dilewati — catatan perpindahan tidak wajib.               (Nanti saja)
```

Bentuknya sama persis dengan tawaran Terapkan yang sudah berjalan
(`tawaranTerapkan`), termasuk `sticky` + lebar terbatas supaya kalimat dan
tombolnya terlihat bersamaan. Menekannya membuka modal dengan rekening itu
**sudah terisi di sisi yang benar**.

**Pintu 3 — klik sel Bertambah/Berkurang.** Sesudah catatannya ada, kedua kolom
jadi hanya-baca; mengkliknya membuka modal yang sama, tersaring ke rekening itu.

### 4.1a Yang SENGAJA bukan pemicu

**Mengubah Harga P / Vol P tidak membuka apa pun.** Satu sel lazim diutak-atik
beberapa kali; modal yang terbuka tiap ketikan tidak bisa dipakai. Spanduk pintu
2 hanya mengikuti keadaan barisnya — sama seperti kotak merah uraian hari ini.

### 4.1b Kapan spanduk baris muncul — patokannya BARIS, bukan dokumen

Rancangan pertama memakai syarat "versi ini sudah punya minimal satu catatan".
**Salah patokan**, dan pemakai pertama langsung menemukannya: pada dokumen baru
spanduk barisnya tidak pernah muncul, jadi orang harus menggulung balik ke bilah
alat untuk sesuatu yang sedang ia kerjakan tepat di depan matanya.

Yang menentukan bukan keadaan dokumen, melainkan **apakah baris itu baru saja
digeser**. Spanduk baris muncul kalau **keduanya** benar —

1. barisnya bergeser (`pergeseran ≠ jumlah`), **dan**
2. tidak ada catatan perpindahan yang menyentuh jangkarnya

— **dan** salah satu dari:

- barisnya digeser **di sesi ini** (`updateVolHarga` menyentuhnya), **atau**
- dokumen ini sudah punya minimal satu catatan

Cabang pertama itu yang membuat spanduknya muncul sejak geseran **pertama**,
tepat di bawah baris yang sedang dikerjakan. Cabang kedua membuatnya tetap
berguna saat dokumen dibuka kembali besok: yang belum dijelaskan tetap menyalak,
seperti daftar pekerjaan yang habis sendiri begitu catatannya dibuat.

Arsip lama yang cuma **dibuka untuk dilihat** tidak menyentuh cabang mana pun —
tidak ada baris yang digeser di sesi itu, dan catatannya memang tidak ada. Diam,
seperti seharusnya.

**Mengubah Harga P / Vol P tetap tidak membuka modal apa pun** — yang muncul
cuma spanduk, dan spanduk tidak menyela. Bedanya dengan rancangan pertama hanya
kapan ia berhak tampil.

### 4.2 Modalnya BERHENTI DI FORM

Pola yang sudah berlaku di Impor (L78), Salin Versi (L80), dan Tutup Pergeseran
(L82): modal mengubah **isi layar**, yang menulis tetap tombol **Simpan**.

Artinya **nol endpoint tulis baru** — seluruh pagar yang sudah ada (izin menu,
sakelar maintenance, kunci setahun, angka kunci optimistic) berlaku otomatis,
dan hak mencatat perpindahan = `bolehEditMenu('pergeseran')` tanpa satu guard
baru. Peran yang cuma boleh melihat tertutup dengan sendirinya.

Body `POST /api/blud/pergeseran` bertambah satu ruas `mutasi: [...]`, ditulis di
`withTransaction` yang sama dengan barisnya.

### 4.3 Isi modalnya

- **Kepala**: "Catatan Perpindahan — versi 01 Sep 2026"
- **Ringkasan**: `2 perpindahan · Rp 54.000.000 · cocok dengan pagu ✓`
  atau `1 rekening belum cocok` (merah)
- **Daftar**: Dari · Ke · Nilai · Keterangan · hapus
  - Dari/Ke = combobox yang isinya **baris yang sedang di layar** saja.
    Rekening di luar dokumen tidak bisa dipilih — jangkarnya tidak ada.
  - Nilai = `InputNominal` (ribuan bertitik)
- **Tombol** `+ Tambah perpindahan`
- **Panel pencocokan**: hanya rekening yang BELUM cocok, dengan angkanya
  (`catatan −42.000.000 · pagu −45.000.000 · selisih 3.000.000`) dan tombol
  lompat ke barisnya.

### 4.4 Yang berubah di tabel utama

- Kolom Bertambah/Berkurang jadi **hanya-baca** untuk versi yang punya catatan
  perpindahan — angkanya dihitung, tidak lagi diketik.
- Selnya bisa ditunjuk untuk melihat asalnya:
  `42.000.000 dari Belanja Perjalanan Dinas Dalam Daerah`.
- **Versi yang BELUM punya catatan perpindahan berjalan persis seperti
  sekarang** — kolomnya tetap bisa diketik tangan. Ini jalan peralihannya, dan
  wajib: 50 snapshot `blud_riwayat_simpan` dan seluruh cadangan Drive dibuat
  sebelum tabel ini ada (pelajaran yang sama dengan §2.2 konsep uraian).

## 5. Data

Tabel baru `pergeseran_mutasi`:

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | BIGINT AI | |
| `tahun_anggaran` | SMALLINT | |
| `versi_tanggal` | DATE | sepasang dengan barisnya |
| `dari_key` | VARCHAR(64) | `anggaran_key`, bukan `row_id` |
| `ke_key` | VARCHAR(64) | |
| `nilai` | DECIMAL(18,2) | > 0 |
| `keterangan` | VARCHAR(255) NULL | |
| `urutan` | INT | |

**`anggaran_key`, bukan `row_id`**: jangkar itu yang bertahan lintas versi dan
yang dipakai realisasi. `row_id` hanya berarti di dalam satu versi.

**Ditulis hapus-lalu-tulis-ulang per `(tahun_anggaran, versi_tanggal)`** — pola
yang sama persis dengan barisnya, di transaksi yang sama. Tidak ada jalur tulis
kedua, jadi tidak ada lubang L69-a.

## 6. Jalur yang WAJIB ikut diurus

Ini bagian yang paling mudah terlewat, dan pelajarannya sudah mahal (L69:
perbaikan belum selesai sampai SEMUA jalur tulis kena). Enam aksi mengganti isi
tabel; catatan perpindahan yang tertinggal akan berdiri di atas pagu yang sudah
berganti:

| Aksi | Perlakuan |
|---|---|
| Tutup Pergeseran | catatan **dilepas** — putaran berikutnya mulai dari nol |
| Sinkronkan DPA | dilepas |
| Salin dari Versi Lain | **ikut disalin** (tahun & jangkar sama) |
| Salin dari Tahun Lain | dilepas (jangkar dibuang, tahun beda) |
| Pulihkan Riwayat Simpan | ikut dipulihkan kalau snapshotnya punya |
| Muat/Pulihkan Cadangan | ikut kalau berkasnya punya |

Baris yang **dihapus** dari tabel juga harus menyeret perpindahan yang menunjuk
jangkarnya — kalau tidak, catatan menunjuk rekening yang sudah tidak ada.

## 7. Yang sengaja TIDAK dikerjakan

- **Membalik arah** (pagu dihitung dari perpindahan) — §3.
- **Mewajibkan catatan perpindahan.** Dokumen tanpa catatan tetap sah dan
  berjalan seperti hari ini. Mewajibkannya membuat seluruh riwayat lama tidak
  terpakai.
- **Menebak pasangan otomatis dari selisih.** Dua rekening turun dan tiga naik
  bisa dipasangkan belasan cara; menebaknya menghasilkan dokumen yang terlihat
  rapi dan salah.
- **Menyimpan Bertambah/Berkurang hasil hitungan.** Preseden `is_latest`: dua
  sumber kebenaran soal angka uang cepat atau lambat berbeda pendapat.

## 8. Yang masih harus diputuskan

1. **Tidak cocok = tolak Simpan, atau peringatan saja?** Condong ke **tolak**,
   supaya sebangun dengan `URAIAN_GESER_TIDAK_COCOK` yang sudah ada — tapi ini
   membuat dokumen setengah jadi tidak bisa disimpan sementara.
2. **Satu perpindahan boleh menyeberang jenis belanja?** (Operasi → Modal).
   Secara aturan anggaran biasanya tidak. Perlu jawaban pemilik aplikasi.
3. **Cetak**: lembar terpisah, atau bagian di bawah tabel yang sudah ada?
4. **Rekap Penanggung Jawab**: apakah perpindahan antar-PJ perlu ditandai?

## 9. Definition of Done

- [ ] Tombol + modal muncul di layar Pergeseran, tunduk `bolehEditMenu`
- [ ] Modal berhenti di form — nol endpoint tulis baru
- [ ] Combobox Dari/Ke hanya berisi baris yang ada di layar
- [ ] Pencocokan per rekening ditegakkan di route, pesannya menyebut rekeningnya
- [ ] Versi tanpa catatan berjalan persis seperti sekarang (kolom bisa diketik)
- [ ] Versi dengan catatan: kolom jadi hanya-baca + asalnya bisa dilihat
- [ ] Keenam jalur §6 diperlakukan sesuai tabel, diuji satu per satu
- [ ] Baris dihapus → perpindahannya ikut terhapus
- [ ] Excel & Cetak memuat daftar perpindahan
- [ ] Realisasi NOL tersentuh — dibuktikan dengan membandingkan pagu efektif
      sebelum dan sesudah
- [ ] Regresi: mutasi yang wajib tertangkap — (a) catatan tidak dilepas saat
      Tutup, (b) pencocokan dilewati di satu cabang, (c) perpindahan menunjuk
      jangkar yang sudah dihapus, (d) versi lama jadi tidak bisa disimpan,
      (e) nilai nol atau negatif diterima
