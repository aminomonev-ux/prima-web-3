# CONCEPT — Unduh gabungan Rekap + Detail per sumber (E-Anggaran)

> Status: **SELESAI** (2026-09-03). Nol endpoint baru, nol kolom, **nol migrasi**.
> §6 dijawab pemilik aplikasi: **pilihan B** — halaman detail di PDF berkop dan
> bertanda tangan, meniru tampilan layar. `exportRealisasiPdf` yang lama ikut
> diperbaiki supaya tidak ada dua bentuk PDF detail di satu aplikasi.
>
> **Temuan susulan yang tidak direncanakan.** Waktu menyiapkan bagian detail
> ternyata baris **JUMLAH** di view Detail memuat DUA cacat yang sama persis
> dengan yang sudah dibereskan di view Rekap — target diturunkan dari persen
> bulat (T5) dan deviasi dikurangkan dari dua angka bulat (T3). Rumusnya terkubur
> di JSX dan **luput dari audit perhitungan**; klaim "audit perhitungan sudah
> tuntas" di konsep sebelumnya keliru. Diperbaiki lewat `lib/kinerja/cetak-detail.ts`,
> yang sekaligus jadi sumber tunggal baris JUMLAH untuk layar, Excel, dan PDF.
> Akibatnya baris JUMLAH bisa bergeser ~0,01% dari cetakan lama.
>
> Regresi: bagian **P** di `scripts/test-kinerja-rekap.mts` — suite jadi **115
> pemeriksaan, 47 uji mutasi**. Lima mutasi bagian P awalnya lolos; empat di
> antaranya L82c lagi (kutipan yang muncul di lebih dari satu tempat) dan satu
> karena data ujinya kebetulan membulat ke persen yang sama.
>
> Diminta: *"di tab rekap tambahkan dropdown untuk mengambil data di tab cetak,
> nanti downloadnya jadi satu file — atasnya halaman rekap, bawahnya BLUD, GAJI,
> dll, dan bisa milih untuk tab-tab itu bulan apa yang dicetak."*

---

## 1. Keadaan sekarang

| View | Isi | Unduhan |
|---|---|---|
| Cetak → **Rekap** | satu tabel, semua sumber, s/d bulan pilihan, 13 kolom | Print · Excel · PDF |
| Cetak → **Detail** | satu sumber, dipecah per bulan, 15 kolom, tiap bulan punya kop + blok tanda tangan | Print · Excel · PDF |

Untuk menyusun satu laporan lengkap, hari ini orang harus mengunduh **1 + 8 = 9
berkas** lalu menggabungkannya sendiri. Itu pekerjaan yang tidak menghasilkan
keputusan apa pun, dan sangat mudah salah — satu sumber terlewat tidak akan
kelihatan.

## 2. Bahannya sudah ada di layar — kecuali satu

Saat view Rekap dibuka, `onFetchAll()` sudah menarik realisasi **semua sumber** ke
`realisasiAllRows`. Jadi unduhan gabungan **tidak perlu satu permintaan pun ke
server**: nol endpoint, nol permukaan sakelar maintenance baru, nol pagar akses
baru.

**Satu ganjalan yang harus dibereskan lebih dulu.** `realisasiAllRows` itu larik
**datar** hasil `SUMBER_LIST.map(...).flat()` — barisnya tidak dikelompokkan per
sumber. Kolom `sumber` sebenarnya ikut terkirim, tapi **hanya secara kebetulan**:

- `getRealisasiRows` (jalur tanpa parameter versi, yang dipakai `fetchRealisasiAll`)
  memang menyertakan `sumber` di tiap baris.
- `getRealisasiHydrated` (jalur versi-aware, dipakai tab Realisasi) **tidak**.
- Tipe `RealRow` di `_types.ts` **tidak mendeklarasikannya sama sekali**.

Jadi memisahkan baris per sumber hari ini akan berjalan, tapi berdiri di atas
perbedaan dua jalur yang tidak disengaja — persis bentuk T1 yang baru saja
dibereskan. **Perbaikannya satu baris**: `fetchRealisasiAll` menandai sendiri
(`rows.map(r => ({ ...r, sumber: s }))`) dan `RealRow` mendeklarasikan
`sumber?: SumberSSK`. Menandai di tempat yang tahu jawabannya, bukan menebak dari
muatan yang kebetulan ada.

## 3. Satu berkas — tapi Excel dan PDF tidak boleh disusun sama

Permintaannya "jadi satu file", dan itu terpenuhi oleh dua-duanya. Yang perlu
diputuskan bukan jumlah berkas, tapi **bentuk di dalamnya**.

| | Excel | PDF |
|---|---|---|
| Susunan | **satu sheet per bagian**: `Rekap`, `GAJI`, `BLUD`, … | **bertumpuk**: halaman rekap, lalu halaman tiap sumber |
| Alasan | Rekap 13 kolom, Detail 15 kolom. Menumpuknya di satu sheet membuat kolom tidak segaris — sorting, filter, dan rumus jadi tidak bisa dipakai. Sheet memang untuk itu. | Kertas memang bertumpuk. Tiap bagian dapat kop sendiri, dan naik halaman baru lewat `doc.addPage()`. |

**Ini satu-satunya tempat saya tidak mengikuti permintaan apa adanya.** Anda
menyebut "atasnya rekap, bawahnya BLUD GAJI" — untuk PDF itu tepat dan akan
persis begitu. Untuk Excel, menumpuk dua tabel berbeda lebar di satu lembar
menghasilkan berkas yang **kelihatan benar tapi tidak bisa diapa-apakan**: kolom
`Bulan` di bagian detail akan berdiri di bawah kolom `Anggaran (Rp)` milik rekap.
Kalau Anda memang butuh satu lembar tertumpuk (misalnya karena penerimanya
mencetak langsung dari Excel), bilang saja — itu keputusan Anda, saya cuma perlu
tahu supaya tidak salah membuat.

## 4. "Bulan" di sini ada dua arti, dan itu sumber kebingungan

- Rekap memakai **s/d bulan** — akumulatif ("S/D September").
- Detail memakai **bulan mana saja yang dicetak** — halaman per bulan.

Menyediakan dua pemilih bebas akan melahirkan dokumen yang bertentangan dengan
dirinya sendiri: berjudul "s/d September" tapi memuat halaman detail Desember.

**Usulan**: satu pemilih untuk bagian detail, dengan tiga pilihan —

| Pilihan | Isi |
|---|---|
| **Ikut rekap** (bawaan) | Januari s/d bulan rekap |
| Satu bulan | hanya bulan itu |
| Semua bulan berdata | apa pun yang ada isinya |

Bawaannya "ikut rekap" supaya dokumen tetap masuk akal tanpa orang harus
memikirkannya.

## 5. Pemilih sumber

Anda menyebut dropdown. Tapi ini pilihan **jamak** (8 sumber), jadi bentuknya
dropdown yang membuka daftar **centang**, bukan dropdown pilih-satu.

Bawaan yang saya usulkan: **hanya sumber yang benar-benar ada datanya**. Di
produksi hari ini cuma GAJI dan BLUD yang berisi — menyertakan 6 sheet kosong
membuat berkasnya lebih sulit dibaca, bukan lebih lengkap. Tetap ada pilihan
"Semua sumber" bagi yang menginginkannya.

**Tombolnya tidak bertambah.** Dropdown ini **mengubah apa yang dihasilkan** tombol
Excel & PDF yang sudah ada. Kalau tidak ada sumber dicentang → hasilnya persis
seperti sekarang (rekap saja). Dicentang → berkasnya jadi bundel. Bilah alat rekap
sudah memuat Print/Excel/PDF; menambah dua tombol lagi di sana membuatnya penuh
dan memaksa orang menebak beda "Excel" dan "Excel Gabungan".

## 6. Yang harus Anda putuskan dulu — bentuk halaman detail di PDF

Ini yang menentukan besar-kecilnya pekerjaan, dan saya tidak bisa memutuskannya
sendiri.

Di **layar**, view Detail itu dokumen resmi: tiap bulan punya kop rumah sakit,
judul "LAPORAN REALISASI KINERJA GAJI — BULAN JANUARI", dan blok tanda tangan
Kabag & Kasubag di bawahnya.

Tapi **`exportRealisasiPdf` yang ada sekarang tidak begitu** — ia cuma tabel rata
dengan satu judul kecil di pojok, tanpa kop dan tanpa tanda tangan.

Dua jalan:

| | A. Ikut PDF yang ada (rata) | B. Ikut tampilan layar (berkop + tanda tangan) |
|---|---|---|
| Hasil | data lengkap, tapi bukan dokumen yang bisa ditandatangani | benar-benar siap cetak & tanda tangan |
| Kerja | kecil — susun ulang yang sudah ada | sedang — kop, tanda tangan, dan pemisahan halaman per bulan harus dibuat |
| Cocok kalau | berkasnya untuk diolah/diarsipkan | berkasnya untuk **dikirim ke pusat** |

Dugaan saya **B** yang Anda maksud (karena tujuannya menggantikan menggabungkan 9
berkas jadi satu laporan), tapi itu dugaan. Kalau B, sekalian
`exportRealisasiPdf` yang lama ikut diperbaiki — supaya tidak ada dua bentuk PDF
detail yang berbeda di satu aplikasi.

## 7. Supaya tidak lahir definisi kedua

Bagian detail sudah punya susunan barisnya di `exportRealisasiExcel` /
`exportRealisasiPdf`, tapi terkubur di dalam fungsi pengunduh. Kalau bundel
menyusunnya sendiri, akan ada **dua definisi tabel detail** yang cepat atau lambat
berbeda — persis penyakit yang §2 konsep pembenahan tulis untuk mencegahnya.

Jadi langkah pertama: keluarkan `realisasiAoa(rows)` dari `exportRealisasiExcel`
(pola `rekapAoa` yang sudah dipakai), lalu bundel dan unduhan per-sumber memakai
fungsi yang sama. Sama seperti rekap: yang diunduh wajib memuat angka yang persis
sama dengan yang di layar.

## 8. Yang sengaja TIDAK dikerjakan

- **Endpoint baru.** Datanya sudah ada di `realisasiAllRows`.
- **Menghitung ulang di pengekspor.** Rekap memakai `rekap` (useMemo yang sudah
  ada), detail memakai baris yang sudah di-`recalc`.
- **Tombol baru di bilah alat.** Dropdown mengubah perilaku dua tombol yang ada.
- **Menyertakan sumber kosong secara bawaan.** Bisa dipilih, tapi bukan bawaan.
- **Menggabungkan CRR/Pendapatan/Laporan** ke bundel yang sama — di luar yang
  diminta, dan bentuk tabelnya berbeda lagi.

## 9. Uji regresi

Ditambahkan ke `scripts/test-kinerja-rekap.mts` (bagian P):

| Bagian | Menguji |
|---|---|
| P1 | `realisasiAoa` dipakai bersama — unduhan per-sumber dan bundel menghasilkan baris identik |
| P2 | bundel memuat sheet `Rekap` + satu sheet per sumber yang dicentang, tidak lebih |
| P3 | sumber tanpa data tidak ikut kalau tidak diminta |
| P4 | "ikut rekap" membatasi detail ke Jan..sdBulan — tidak ada baris Desember di dokumen s/d September |
| P5 | angka di sheet Rekap identik dengan `hitungRekap` (sama seperti N5–N7) |
| P6 | tanpa sumber dicentang, hasilnya persis sama dengan unduhan rekap hari ini |
| P7 | baris ditandai sumbernya di `fetchRealisasiAll`, bukan mengandalkan muatan server |

Pohon uji wajib memuat **dua sumber dengan bulan berbeda** — satu berdata sampai
Juli, satu sampai September. Kalau keduanya sama, P4 lulus tanpa menguji apa pun.

## 10. Tahapan

| Tahap | Isi | Risiko |
|---|---|---|
| A | Tandai `sumber` di `fetchRealisasiAll` + deklarasikan di `RealRow` (§2) | rendah |
| B | Keluarkan `realisasiAoa` dari pengunduh detail (§7) | rendah |
| C | Dropdown pilih sumber + pemilih bulan detail (§4, §5) | rendah |
| D | Excel multi-sheet (§3) | rendah |
| E | PDF bertumpuk — bentuknya menunggu jawaban §6 | rendah / sedang |

A dan B tidak mengubah apa pun yang terlihat — keduanya membereskan pondasi supaya
C–E tidak melahirkan definisi kedua. Bisa dikerjakan lebih dulu tanpa menunggu
jawaban §6.
