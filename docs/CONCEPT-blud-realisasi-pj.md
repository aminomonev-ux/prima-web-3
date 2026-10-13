# CONCEPT — Realisasi per Penanggung Jawab + penjaga PJ di Pergeseran

> Status: **selesai** (2026-10-13). Yang berubah saat dikerjakan → §9.
> Nol kolom, nol tabel, nol migrasi. Satu parameter baru di endpoint baca yang sudah
> ada (`GET /api/blud/realisasi/register?pj=`), nol endpoint tulis.

---

## 1. Yang diminta

> *"kan di dpa dan pergeseran itu ada pj nya kan ? nah agar di realisasi nanti bisa tahu
> pj ini punya realisasi berapa aja di rekeningnya dan bahkan detail transaksinya"*

Tiga pertanyaan yang harus bisa dijawab layar Realisasi:

1. Seorang PJ sudah merealisasikan berapa (bulan ini, s.d. bulan ini, sisa)?
2. Di rekening mana saja?
3. Transaksi apa saja (tanggal, kuitansi, nilai)?

Ditambah dua permintaan susulan: **unduhan Excel & PDF**, dan **penjaga PJ di Pergeseran
sama seperti DPA** (memperingatkan, tidak menolak).

## 2. Letaknya di menu Realisasi, bukan menu baru

Datanya sama (pagu dari versi yang berlaku + transaksi Buku Kas), pemilih bulannya sama,
hak aksesnya sama. Menu baru = izin & sakelar maintenance baru yang harus dijaga
terpisah (L72), untuk data yang sudah dijaga pagar menu `realisasi`.

Di bilah alat ada dua chip: **Per Rekening** (tabel lama) | **Per PJ** (baru).

## 3. PJ sebuah rekening — dihitung, tidak disimpan

PJ di DPA/Pergeseran dipasang di sebuah baris (biasanya induk) dan berlaku untuk seluruh
turunannya — aturan "1 PJ per rantai vertikal" yang dijaga Sentinel PJ. Jadi:

> **PJ rekening = PJ di baris itu sendiri atau leluhur ber-PJ teratas, diambil dari versi
> yang SEDANG jadi sumber pagu** (`getPaguEfektif` → `sumberPaguTahun`).

`pagu.ts` cukup ikut membaca kolom `penanggung_jawab` di dua SELECT-nya. `'-'` dan spasi
berlebih dirapikan (`pjBersih`) — keduanya isian nyata di data.

**Keputusan pemilik (opsi A):** PJ diambil dari versi pagu **sekarang**. Akibatnya,
kalau PJ sebuah rekening berganti di tengah tahun, transaksi Februari ikut pindah ke PJ
yang baru. Alternatifnya (PJ dicatat saat transaksi terjadi) butuh kolom baru di
`blud_realisasi_tx` yang transaksi lama tidak punya isinya — dan pagu per PJ tetap diukur
dari versi sekarang, jadi dua angka di satu baris berdiri di atas dua dasar.

## 4. Angka per PJ — tidak bisa berbantah dengan tabel per rekening

Angka di layar Realisasi **sudah digulung** ke induk (`gulungKeAtas`). Jadi angka seorang
PJ = angka baris "kepala"-nya (baris ber-PJ teratas di rantainya), tanpa menjumlah ulang
apa pun. Kolom s.d. di tabel Per Rekening pada baris itu PASTI sama.

- **Belum ada PJ** = total akar − Σ PJ. Dengan begitu jumlah semua baris rekap = baris
  JUMLAH tabel Per Rekening, persis.
- Kolom "Rekening" menghitung **daun** milik PJ itu (bukan baris induk — L85).
- Sisa & % memakai acuan yang sama dgn route pagu (s.d. bulan terpilih); % dibulatkan ke
  bilangan bulat seperti tabel Per Rekening.

Semua aturannya di `lib/blud/realisasi-pj.ts` (MURNI, tanpa impor) — dipakai layar,
server, dan unduhan.

## 5. PJ ganda dalam satu rantai

Induk dan turunan sama-sama ber-PJ. Di sini **PJ induk yang menang** dan jumlah baris
bentrok dilaporkan sebagai spanduk (`konflik`) yang menunjuk menu Pergeseran/DPA.

Cetak Rekap PJ hanya **setengah** sejalan: TOTAL-nya melewatkan turunan yang bentrok
(`auditRekapPJ`), tapi subtotal per PJ-nya mentah, sehingga uang turunan itu tampil di
dua PJ. Di Realisasi per PJ tiap rupiah cuma punya SATU PJ — kalau tidak, jumlah baris
rekap tidak lagi sama dengan total. Kalimat spanduk menyebut beda itu terang-terangan.

## 6. Rincian satu PJ (modal)

Klik baris PJ → `RealisasiPjModal`:

- **Rekening**: daun milik PJ + pagu/s.d./sisa/%; klik uraian membuka register rekening
  yang sudah ada.
- **Transaksi**: `GET /api/blud/realisasi/register?tahun&pj&sampai_bulan` →
  `getRegisterPj`. Rekeningnya ditentukan `kunciMilikPj` — fungsi yang SAMA dengan rekap
  di layar, jadi total transaksi = angka s.d. PJ itu (dibuktikan di MySQL, §8).
  `pj=` kosong = transaksi rekening tanpa PJ.
- Satu kuitansi bisa dibagi ke rekening milik PJ berbeda: yang ditampilkan hanya bagian
  milik PJ itu, dengan keterangan "bagian dari kuitansi Rp …" (`total_kuitansi`).

Pagar endpoint tidak berubah: sakelar Realisasi, `bolehLihat('realisasi')`, rate limit
`view-register`. Nama PJ > 128 karakter ditolak (= lebar kolom).

## 7. Saringan PJ & unduhan

- **Per Rekening** dapat pemilih PJ: tabel biasa difokuskan ke rekening milik satu PJ,
  spanduk menyebut jumlah rekening, pagu, dan s.d.-nya. Pilihan yang sudah tidak ada di
  rekap (ganti tahun/versi) dilepas sendiri.
- **Excel** (2 lembar: Rekap per PJ · Rincian Rekening dgn subtotal per PJ) dan **PDF**
  (rekap, lalu rincian di halaman baru). Dibangun dari `rekapPj` yang SAMA dengan layar
  (`tabelRekapPj`/`tabelRincianPj`) — dokumen tidak menghitung ulang. Nama berkas
  `Realisasi-per-PJ-{Bulan}-{Tahun}`. exceljs/jspdf dimuat dinamis.

## 8. Penjaga PJ di Pergeseran

Dulu kolom PJ Pergeseran bisa diisi bebas di semua baris tanpa penjaga apa pun, padahal
Realisasi per PJ membaca PJ dari Pergeseran (sumber pagu terbaru). Kini **cermin DPA**:

- `useSentinelPjGuard` dibuat generik (`idAwalan`, bawaan `dpa-row-` → layar DPA tak
  berubah); Pergeseran memakai `perg-row-`.
- Mengisi PJ di baris yang rantainya sudah ber-PJ → `PjConflictDialog` (Batal/Tetap).
- Menambah anak/saudara di bawah baris ber-PJ → `PjMutationDialog`.
- Ikon ⚠ di sel PJ + spanduk pasangan bentrok dengan tombol lompat.
- Server (`POST /api/blud/pergeseran`) **mencatat** (`BLUD_PJ_CHAIN_CONFLICT` + jumlahnya
  di detail `BLUD_SAVE_PERGESERAN`), **tidak menolak** — sama dengan DPA. Pengguna yang
  memilih "Tetap Lanjutkan" berhak menyimpannya.
- Tombol lompat di spanduk (DPA & Pergeseran) dulu berbunyi "?" untuk baris tanpa kode —
  padahal baris rincian lazim tanpa kode. Kini `labelBarisPj`: kode → potongan uraian → "?".

## 9. Yang berubah saat dikerjakan / sengaja tidak

- **Baris "Di luar versi pagu" TIDAK dibuat** (konsep awal menjanjikannya). Belanja yang
  rekeningnya sudah lenyap dari versi pagu juga tidak ada di tabel Per Rekening — JUMLAH
  tabel itu pun tanpa dia. Menambahkannya hanya di tampilan PJ membuat dua total di layar
  yang sama berbeda. Tempatnya spanduk "rekening hilang" yang sudah ada, dan catatan yatim
  di Beranda (§9.1a konsep serapan).
- Kalimat "sama dengan Cetak Rekap PJ" ditarik — terbukti hanya benar untuk total (§5).
- Tabel di modal sempat tanpa jarak sel ("60.000.0000" — Sisa & % menempel), sebab ia di
  luar `.blud-scroll-wrapper` → kelas `.rl-pj-tabel`. Ditemukan saat dilihat, bukan dari kode.
- **"PJ saya"** belum bisa: PJ itu label teks, tidak terhubung ke akun.

## 10. Uji

- `npx tsx scripts/test-blud-realisasi-pj.mts` (57) — A–D perilaku fungsi murni, E–G
  sambungan server/layar/Pergeseran (komentar dibuang dulu, L82c).
- `node scripts/test-blud-realisasi-pj-db.mjs` (14) — MySQL kotak pasir 2099: transaksi
  per PJ = angka rekap, kuitansi terbagi, PJ ganda, tanpa PJ, batas bulan.
- 26 uji mutasi tertangkap.
- Diverifikasi di peramban pada salinan data 2026 di 2099: rekap (JUMLAH Rp 19.700.000 =
  tabel Per Rekening), modal Rekening/Transaksi (kuitansi Rp 4,2 jt terbagi), saringan,
  isi Excel (2 lembar, angka = layar) & PDF, spanduk/⚠/dua dialog di Pergeseran (dibatalkan,
  baris tetap 558), tema terang, 375 px (halaman tidak melebar; tabel bergeser sendiri).
