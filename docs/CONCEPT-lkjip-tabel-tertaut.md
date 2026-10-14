# Konsep — Tabel LKJIP yang Tertaut ke Modul (E-Anggaran & Renaksi)

Status: **Tahap 1 dikerjakan** (2026-10-14). Catatan pelaksanaan di §17.

## 1. Kebutuhan

Bab III LKJIP hampir selalu memuat dua tabel yang angkanya sudah ada di PRIMA:

- **Capaian kinerja** — target vs realisasi indikator (modul Renaksi).
- **Realisasi anggaran** — pagu vs realisasi (modul E-Anggaran).

Sekarang keduanya diketik ulang di blok Tabel LKJIP, dan angka yang diketik ulang lambat laun
berbeda dengan sumbernya. Yang diminta: blok Tabel bisa **mengambil** tabel dari menu Cetak
E-Anggaran dan menu Cetak Renaksi, dengan **bentuk yang diatur sendiri** (jumlah kolom, judul,
gabungan sel judul, kolom mana diisi dari kolom sumber mana).

## 2. Keputusan yang sudah disepakati

| # | Keputusan | Alasan singkat |
|---|---|---|
| K1 | **Salinan bertaut**, bukan tautan hidup dan bukan salin-sekali | Dokumen diam sampai orangnya menekan **Perbarui**; bentuk tidak hilang saat diperbarui |
| K2 | Sel yang diisi dari sumber **dikunci**; bebas sepenuhnya lewat **Lepas Tautan** | Angka ketikan tangan di atas data sumber = dua sumber kebenaran |
| K3 | Keterangan "Sumber: … ditarik …" **hanya di editor**, tidak tercetak di Word | Keputusan pemilik |
| K4 | Sumber Renaksi = **tabel menu Cetak Renaksi**; Target (Data Entry) / Realisasi bisa dipilih | Keputusan pemilik |
| K5 | **Kolom rumus** ikut (mis. Sisa = Pagu − Realisasi); Word menerima ANGKA, bukan rumus | Keputusan pemilik |
| K6 | Gabung sel di **badan** tabel diganti aturan per kolom **"gabung otomatis"**; kepala tabel tetap bebas digabung | Gabungan per nomor baris rusak begitu jumlah baris berubah (§6.3) |

## 3. Yang disimpan di blok

Tidak ada tabel/kolom/migrasi baru: semuanya masuk `lkjip_block.payload` (JSON) blok TABEL yang
sudah ada. Bentuk tabelnya tetap bentuk lama (`kolom`, `headerRows`, `rows`, sel ber-`cs`/`rs`/`nf`),
jadi **`docgen.ts` tidak berubah** — Word membaca sel seperti biasa. Yang ditambahkan satu field:

```ts
tautan?: {
  sumber:  'kinerja-rekap' | 'renaksi-cetak'
  setelan: SetelanKinerjaRekap | SetelanRenaksiCetak   // Zod per sumber
  /** Sejajar dengan `kolom` tabel — pemetaan menempel pada KOLOM, bukan posisi. */
  kolom: Array<{
    isi:
      | { jenis: 'sumber'; kunci: string }        // kolom sumber, mis. 'realKeu'
      | { jenis: 'nomor' }                        // nomor urut dihitung ulang
      | { jenis: 'rumus'; ekspresi: string }      // mis. '=C-D'
    gabungSama?: boolean                          // §6.3
    bertingkat?: boolean                          // §6.4
  }>
  /** Kunci baris badan, sejajar dengan baris sesudah `headerRows`. */
  kunciBaris: string[]
  sembunyi:   string[]          // kunci baris yang disembunyikan
  ditarikPada: string           // 'YYYY-MM-DD HH:MM' WIB
  ringkas:    string            // "E-Anggaran · Rekap s/d Desember 2026 · Versi Berlaku"
  catatan:    string[]          // catatan sumber saat ditarik (§9)
}
```

**Jebakan:** `TabelPayloadSchema` (Zod) membuang kunci yang tidak dikenalnya. Kalau `tautan`
lupa didaftarkan di skema, resepnya hilang diam-diam saat Simpan — tabelnya tampak benar,
tombol Perbarui lenyap begitu halaman dimuat ulang. Wajib diuji bolak-balik lewat skema.

## 4. Dua pintu, satu resep

1. **Ambil dari Modul** (tabel baru/kosong): pilih sumber → setelan → pratinjau → pilih kolom →
   kepala tabel dibuat satu baris dari judul kolom sumber, lalu bisa diubah/ditambah baris
   kepala dan digabung.
2. **Hubungkan ke Modul** (tabel yang sudah dibentuk sendiri, mis. 5 kolom dengan kepala 2
   baris yang digabung): kepala tabel milik pengguna **tidak disentuh**; tiap kolom diberi
   pilihan **"Isi dari…"**. Kalau tabelnya sudah berisi ketikan, badan tabel diganti — ditanya dulu.

Keduanya berujung pada `tautan` yang sama. Kolom tanpa "Isi dari" menahan tombol Masukkan
(kolom isian tangan baru ada di Tahap 2).

## 5. Isi kolom

| Jenis | Isi | Catatan |
|---|---|---|
| Kolom sumber | Nilai kolom sumber apa adanya | Format mengikuti jenis kolom sumber (Rp / % / angka / teks), boleh diganti |
| Nomor urut | 1, 2, 3 … dihitung ulang | Kolom "No" sumber berlubang begitu ada baris disembunyikan (1, 2, 4, 5) — ini jalan keluarnya |
| Rumus | Ekspresi per baris dengan huruf kolom LKJIP: `=C-D`, `=D/C`, `=ROUND(D/C,4)` | Lihat §5.1 |

### 5.1 Kolom rumus

- Ditulis dengan **huruf kolom tabel LKJIP tanpa nomor baris** (`=C-D`), berlaku untuk tiap
  baris badan. Fungsi yang tersedia = fungsi tabel LKJIP yang sudah ada (`SUM`, `ROUND`, `IF`,
  `ABS`, `MIN`, `MAX`, …) — evaluator `lib/lkjip/tabel.ts` dipakai ulang, tidak ditulis kedua.
- Dihitung **saat ditarik/diperbarui**, hasilnya disimpan sebagai **angka**. Word tidak pernah
  menerima rumus.
- Gagal hitung (bagi nol, kolom kosong) → **"—"**, bukan `#ERR`. `displayValue` sekarang
  menulis `#ERR`, dan itu akan tercetak di dokumen resmi.
- Hanya sebaris (tidak boleh menunjuk baris lain) — baris badan berganti tiap Perbarui.

### 5.2 Jebakan format persen

Sel tabel LKJIP memakai aturan Excel: nilai `0,5` berformat `pct` tampil **50%**. Sumber menyimpan
persen sebagai `55,07` (sudah dikali 100). Kolom sumber berjenis persen **dibagi 100 saat
ditarik**; tanpa itu tampil **5507%**. Kolom rumus `=D/C` otomatis cocok dengan aturan ini.

## 6. Badan tabel

### 6.1 Kunci baris

Tiap baris badan punya kunci yang bertahan lintas Perbarui — dipakai untuk baris tersembunyi,
ringkasan perubahan, dan (Tahap 2) isian tangan:

- **E-Anggaran Rekap**: jalur nama `program › kegiatan › subkegiatan › uraian SSK › canonical_id`.
  `BarisRekap` belum punya kunci → ditambah field `kunci` di `hitungRekap` (aditif, layar Cetak
  tidak terpengaruh). Nama program diperbaiki di SSK = baris lama hilang + baris baru muncul,
  dan ringkasan Perbarui menyebutnya.
- **Renaksi Cetak**: `id` indikator. `buildHierarchyRows` menjaga tiap `id` hanya muncul sekali
  (`used.has` di tiap tingkat). Komentar di `CetakPanel.tsx` yang menyebut `source.id` bisa
  kembar sudah usang, ditulis sebelum penjaga itu ada.

### 6.2 Sembunyikan baris

Diingat per kunci, bukan nomor urut. Baris baru dari sumber tampil (tidak tersembunyi) dan
ditandai di ringkasan Perbarui.

### 6.3 Gabung otomatis (pengganti gabung manual di badan)

Gabungan manual tersimpan sebagai "baris 1 s/d 3"; sesudah Perbarui yang menghapus satu
indikator, gabungan itu menaungi indikator milik sasaran lain — salah tanpa galat. Karena itu
selama tertaut, alat gabung sel **mati di badan tabel**, dan penggantinya centang per kolom
**"gabung otomatis baris yang isinya sama"**:

- Hanya menggabung baris **berurutan** yang isinya sama dan tidak kosong.
- Hanya **di dalam gabungan kolom di kirinya** (gaya pivot) — dua kegiatan bernama sama di
  bawah dua program berbeda tidak tergabung.
- Dihitung ulang tiap Perbarui, ditulis sebagai `rs` biasa → Word (`vMerge`) tidak berubah.

### 6.4 Uraian bertingkat

Rekap E-Anggaran punya tingkat (`indent`) dan baris tebal (`tebal`). Kolom berisi uraian bisa
diberi centang **"bertingkat"**: menjorok dengan spasi di depan (cara unduhan Rekap yang sudah
ada; tabel Word tidak punya indentasi per baris) + baris induk ditebalkan.

## 7. Perbarui

1. Tarik ulang dengan resep yang sama.
2. Bandingkan per kunci baris dengan isi sekarang → **ringkasan dulu**, belum mengubah apa pun:
   *"6 angka berubah · 1 baris baru (Program …) · 1 baris hilang (…)"*, plus kolom yang
   sumbernya tidak ada lagi (§9.2) dan baris tersembunyi yang hilang dari sumber.
3. **Terapkan** / Batal. Nol perubahan → "Tidak ada yang berubah", tanpa dialog
   (pola `bedaSinkron` Pergeseran: bandingkan dulu baru bertanya).
4. Grafik yang mengambil data dari tabel ini (`GRAFIK.source = 'tabel'`) diberi tanda
   **"perlu digambar ulang"** — gambarnya PNG, tidak ikut berubah sendiri.
5. Dokumen **FINAL**: Perbarui tidak ditawarkan (server sudah menolak tulis lewat `LkjipFinalError`).

## 8. Lepas Tautan

Menghapus `tautan`; isi sel (termasuk hasil kolom rumus) tetap sebagai teks/angka biasa, dan
tabel kembali jadi tabel bebas seperti sekarang (rumus sel, gabung sel di mana saja). Satu arah,
ditanya lewat `confirmDialog`. Riwayat Versi LKJIP tetap bisa mengembalikan keadaan sebelumnya.

## 9. Sumber Tahap 1

### 9.1 E-Anggaran · Rekap Semua Sumber

- **Setelan** = setelan Cetak → Rekap: tahun (bawaan tahun dokumen LKJIP, boleh diganti untuk
  pembanding tahun lalu), s/d bulan, versi (Berlaku / Murni), kedalaman (Program … Rekening).
- **Kolom** (13): No · Uraian · Anggaran (Rp) · Target s/d Bln (%) · Realisasi Fisik (Rp) ·
  Realisasi Fisik (%) · Deviasi Fisik (%) · Tingkat Capaian Fisik (%) · Target Keu (Rp) ·
  Bulan Ini (Rp) · Realisasi Keu s/d Bln (Rp) · Realisasi Keu (%) · Deviasi Keu (%).
- **Angka = angka layar Cetak**: memakai `hitungRekap` yang sama. Pemuatannya (`fetchRealisasiAll`
  di `kinerja-client.tsx`: 8 sumber, resolusi versi murni lewat `versi-list`, `recalcAllRealisasi`)
  **dipindah ke satu fungsi di `lib/kinerja/`** yang dipakai layar Cetak DAN LKJIP — dua salinan
  resep pemuatan = dua jawaban (L78/L88). Urusan giliran muat (`giliranMuatRef`) tetap di layar.
- **Catatan ikut ditarik**: sumber dinol-kan, "belum ada realisasi", rekening yatim, baris kembar
  — tampil di pratinjau dan di bilah sumber editor. Rp 0 tanpa keterangan dibaca "belum dipakai".

### 9.2 Renaksi · Cetak

- **Setelan** = setelan Cetak Renaksi untuk BARIS: mode hirarki/daftar, level yang tampil,
  fokus tujuan/sasaran/program. Memakai `buildCetakRows` + `applyFocus` yang sama.
- **Kolom**, dikelompokkan di pilihan "Isi dari…":
  - *Identitas*: No, Tujuan, Sasaran, Program, Kegiatan, Sub Kegiatan, Sasaran (Outcome),
    Indikator, Jenis, Satuan.
  - *Target (Data Entry)*: Target RPJMD, Target Tahunan, Target TW I–IV.
  - *Realisasi*: Realisasi TW I–IV, Realisasi Akhir Tahun, **Capaian (%)**.
  - *Anggaran*: Anggaran (Rp) (`anggaranRollup`).

  Sakelar Target / Realisasi / Keduanya di menu Cetak berubah wujud jadi pengelompokan ini —
  lebih luwes (mis. Target Tahunan + Realisasi Akhir + Capaian, tanpa kolom triwulan).
- **Capaian (%)** = `hitungCapaianPct(target_tahunan, realisasiAkhirTahun, jenis)` — persis
  rumus layar Cetak Renaksi (`CetakPanel.tsx`), Progres Negatif sudah dibalik.
- **Kolom yang hilang ditandai**: kolom yang menunjuk kunci sumber yang tidak ada lagi diberi
  tanda "sumber kolom tidak ada", tidak dikosongkan seolah nol.
- **Temuan sampingan — SUDAH DIPERBAIKI (2026-10-14)**: layar Cetak Renaksi menampilkan kolom
  **Capaian**, tetapi PDF/Excel gabungannya tidak. Kini kolom Capaian ada di `cetakHeader`
  (`capaianTahunan` + `tulisPersen` dipakai layar, PDF, Excel), dan kesamaan judul kolom layar
  vs spesifikasi dijaga `scripts/test-renaksi-cetak-kolom.mts`. Adaptor LKJIP tinggal memakai
  `cetakHeader` apa adanya.

## 10. Akses, sakelar, audit

- **Nol endpoint baru.** Penarikan berjalan di editor lewat endpoint modul sumber yang sudah ada
  (`GET /api/kinerja/realisasi`, `GET /api/kinerja/ssk/versi-list`, `GET /api/rencana-aksi`).
  Akibatnya pagar modul sumber berlaku dengan sendirinya: akses E-Anggaran/Renaksi (bukan cukup
  akses LKJIP — kalau tidak, LKJIP jadi pintu belakang), sakelar maintenance, rate limit.
- Tanpa akses modul sumber: sumbernya tidak ditawarkan; tabel yang sudah tertaut tetap tampil
  & tetap tercetak dari tarikan terakhir, Perbarui ditolak dengan kalimat yang menyebut
  modulnya ("butuh akses E-Anggaran").
- Membuka dokumen & unduh Word **tidak** butuh akses modul sumber — `generate` tetap
  "murni unduh".
- Tulis tetap lewat `PATCH /api/lkjip/block` (pagar FINAL + rate limit yang sudah ada); detail
  audit `LKJIP_BLOCK_UPDATE` menyebut sumbernya bila blok tertaut.

## 11. Batas

- Blok tabel: **12 kolom × 500 baris** (`TabelPayloadSchema`). Rekap kedalaman "Termasuk
  Rekening Belanja" bisa melewati 500 → ditolak dengan saran memilih kedalaman lebih dangkal,
  **tidak dipotong diam-diam**.
- Tahun: bawaan tahun dokumen; boleh tahun lain (pembanding), disebut di ringkasan sumber.

## 12. Sengaja tidak dibuat (Tahap 1)

- Tautan hidup (angka dibaca tiap dibuka) — K1.
- Menyunting angka hasil tarikan — K2 (pakai Lepas Tautan).
- Gabung manual di badan selama tertaut — K6.
- Kolom isian tangan, Periksa kesegaran, templat satu klik → Tahap 2.
- Angka sebaris di narasi, sumber PK/BLUD → Tahap 3.

## 13. Berkas yang disentuh (Tahap 1)

| Berkas | Perubahan |
|---|---|
| `lib/lkjip/tautan.ts` (BARU, murni) | Tipe & Zod resep, `bangunBadan` (pemetaan, persen ÷100, nomor, rumus, sembunyi, gabung otomatis, bertingkat), `bandingPerbarui` |
| `lib/lkjip/sumber/*.ts` (BARU) | Daftar sumber + adaptor `kinerja-rekap` & `renaksi-cetak` (katalog kolom, setelan, tarik) |
| `lib/kinerja/muat-rekap.ts` (BARU) | Pemuatan bahan Rekap dipindah dari `kinerja-client.tsx` |
| `lib/kinerja/rekap.ts` | `BarisRekap.kunci` (aditif) |
| `lib/lkjip/schemas.ts` | `TabelPayloadSchema` menerima `tautan` |
| `app/(dashboard)/lkjip/[id]/editor-client.tsx` | Tombol Ambil/Hubungkan, bilah sumber + Perbarui/Atur Bentuk/Lepas Tautan, kunci sel, gabung badan mati, penanda grafik |
| komponen modal (BARU) | Ambil dari Modul / Atur Bentuk / ringkasan Perbarui |
| `app/(dashboard)/kinerja/kinerja-client.tsx` | Memakai `muat-rekap.ts` |
| `app/api/lkjip/block/route.ts` | Detail audit menyebut sumber |
## 14. Pertanyaan terbuka

1. ~~Kolom Capaian Cetak Renaksi di PDF/Excel~~ — diputuskan & sudah diperbaiki (§9.2).
2. Kolom isian tangan tetap Tahap 2?

## 15. Rencana uji

- `scripts/test-lkjip-tabel-tertaut.mts` — perilaku `tautan.ts` sungguhan: pemetaan 13 → 5 kolom,
  persen ÷100, nomor urut sesudah sembunyi, rumus & "—" saat bagi nol, gabung otomatis gaya pivot
  (termasuk nama kembar di induk berbeda), kunci kembar Renaksi, ringkasan Perbarui, bolak-balik
  `TabelPayloadSchema` (resep tidak hilang), angka adaptor = angka `hitungRekap`/layar Cetak.
- Pembanding pemuatan Rekap lama vs `muat-rekap.ts` (hasil identik).
- Uji mutasi untuk tiap aturan di atas.
- Peramban di kotak pasir 2099 (data 2026 hanya dibaca): Ambil, Hubungkan ke tabel berkepala
  gabung, Perbarui sesudah data sumber diubah, Lepas Tautan, unduh Word, FINAL, akun tanpa akses
  E-Anggaran, tema terang, 375 px.

## 16. Tahapan

- **Tahap 1** — §4–§11 untuk dua sumber.
- **Tahap 2** — kolom isian tangan per baris (diingat per kunci; yang kehilangan barisnya
  disebut di ringkasan Perbarui), Periksa kesegaran semua tabel tertaut, templat satu klik
  ("Tabel Pengukuran Kinerja", "Realisasi Anggaran per Program"), sumber Laporan per sumber dana.
- **Tahap 3** — angka sebaris di narasi ("Realisasi anggaran sebesar Rp X (Y%)"), sumber PK & BLUD.

## 17. Catatan pelaksanaan Tahap 1

Yang berbeda dari rancangan di atas, dan sebabnya:

- **Dua pintu jadi satu tombol "Hubungkan ke Modul".** Tabel kosong (judul "Kolom N", tanpa isi)
  langsung dapat kolom bawaan sumbernya; tabel yang sudah dibentuk mempertahankan judul & kepalanya,
  isinya ditebak dari judul yang sama persis dengan judul kolom sumber, sisanya dipilih. Memilih
  isi kolom berjudul bawaan mengganti judulnya dengan judul sumber.
- **Kolom diatur di modal (Atur Bentuk), bukan di kisi.** Selama tertaut, +Baris/+Kolom/hapus
  kolom/hapus baris badan dan alat format/gabung/tempel di badan dimatikan (Salin tetap boleh).
  Mengubah "Header: N baris" menyisip/membuang baris KOSONG di atas badan — tidak lagi "meminjam"
  baris badan jadi kepala, karena kunci tiap baris badan harus tetap sejajar.
- **Hubungkan, Perbarui, Lepas langsung disimpan** (lewat simpan blok biasa) — ketiganya sudah
  ditanyakan; riwayat urungkan dikosongkan sesudahnya (memulihkan baris tanpa resepnya = tak sejajar).
- **Perbarui yang tidak mengubah apa pun tidak menulis** (pola Simpan identik BLUD). Kolom Nomor
  urut tidak dihitung di ringkasan — ia bergeser sendiri begitu ada baris hilang.
- **Kunci baris Renaksi = `id` saja** — `buildHierarchyRows` sudah menjamin tiap id sekali.
- **Penanda grafik basi lewat `tabelSidik`** (kolom payload GRAFIK, bawaan `''`): grafik yang
  mengambil data tabel menyimpan sidik datanya saat Simpan; editor menandai bila data tabelnya
  berubah sesudahnya. Grafik lama tanpa sidik tidak ditandai.
- **Temuan saat diuji**: pemformat angka tabel LKJIP (`formatNumber`, dipakai editor & Word)
  memakai `toFixed` langsung — 2,675 tampil "2,67". Kini dibulatkan `bulatkanDesimal` dulu.
- **Pemuat Rekap E-Anggaran** pindah ke `lib/kinerja/muat-rekap.ts`; pembanding lama-vs-baru di
  uji membuktikan hasilnya identik. Sumber yang ditolak kini dilaporkan (`gagal`) — layar Cetak
  tetap mendiamkannya seperti dulu, LKJIP memakainya untuk kalimat "Butuh akses E-Anggaran".
- **Ikut dikerjakan (keputusan pemilik)**: Capaian Progres Negatif yang realisasinya belum diisi
  ditulis "—", bukan 200% — `capaianTahunan`/`capaianRpjmd`/`capaianTriwulan` di
  `rencana-aksi/_lib/types.ts`, dipakai layar Indikator, Cetak (layar/PDF/Excel), unduhan per
  indikator, dan dialog ubah jenis. Batasnya: realisasi triwulan `NOT NULL DEFAULT 0`, jadi di level
  non-sub-kegiatan (tanpa realisasi bulanan) nol SUNGGUHAN juga terbaca "belum diisi".

Regresi: `npx tsx scripts/test-lkjip-tabel-tertaut.mts` + `npx tsx scripts/test-renaksi-cetak-kolom.mts`.
