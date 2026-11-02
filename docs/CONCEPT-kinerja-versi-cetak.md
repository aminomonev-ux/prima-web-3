# CONCEPT — Versi SSK di Cetak, Perubahan dari RKO murni kosong, dropdown Renaksi terpotong

> Tiga permintaan pemilik aplikasi, 2 Nov 2026, digabung jadi satu pekerjaan:
>
> 1. *"di cetak bisa tidak tambahkan versi tersebut sehingga user bisa pilih ketika
>    pilih versi murni dia bisa lihat download dll"*
> 2. *"di ssk obat itu kosong murni … dapat anggaran saya klik lah buat perubahan
>    tapi notifnya seperti itu harusnya bisa"* — notifnya
>    "Versi source (MURNI seq=0) tidak ditemukan / kosong."
> 3. *"di renaksi ini di salah satu pilihan tidak bisa di scroll ke bawah"*
>
> **Nol tabel, nol kolom, nol migrasi, nol endpoint baru.**
>
> **Status: dikerjakan 2 Nov 2026.** Regresi `npx tsx --env-file=.env.local
> scripts/test-kinerja-versi-cetak.mts` (bagian D kotak pasir 2096). Ikut dibereskan saat
> mengerjakan: nama berkas **bundel** Rekap (Rekap + detail) dulu tidak menandai pilihan
> "Versi Murni" padahal Rekap tunggal sudah — kini `namaBundel` memakai `imbuhanBerkasVersi`
> yang sama; lencana LATEST di pemilih versi memakai `pickVersiAktif` (satu aturan, L88).

---

## 1. Cetak per sumber dapat pemilih versi

### 1.1 Keadaan sekarang (diperiksa di kode)

- Cetak per sumber (GAJI, BLUD, …) **sudah** memuat data menurut versi SSK yang
  dipilih. State-nya `sskVersi` di `kinerja-client.tsx`, dipakai bersama tab
  Realisasi: `ambilRealisasi` bergantung padanya, jadi mengganti versi memuat
  ulang baris Cetak.
- Tapi di Cetak versinya cuma **label** (`versiLabel`, lencana ungu + "Berdasarkan
  SSK MURNI"). Pemilihnya hanya ada di tab Realisasi. Jadi mencetak versi murni
  = buka Realisasi, pilih MURNI, kembali ke Cetak — jalan yang tidak akan ditebak
  siapa pun.
- Cetak → Rekap sudah punya pemilih sendiri ("Versi Berlaku / Versi Murni",
  `docs/CONCEPT-kinerja-pilih-versi-rekap.md`). Tidak disentuh.

### 1.2 Rancangan

1. Label di bilah alat Cetak diganti `VersiPickerKinerja` — komponen yang sama
   dengan RKO & Realisasi, **tanpa** `onCreatePerubahan` (versi baru lahir di RKO).
   `onChange` = `pilihVersi` milik shell, persis yang dipakai tab Realisasi.
2. **Satu state, bukan dua.** Memilih MURNI di Cetak lalu membuka Realisasi =
   Realisasi juga MURNI. Itu disengaja: pemilihnya terlihat di sana, dan
   Realisasi sudah otomatis hanya-baca bila versinya terkunci
   (`versiLocked`). Pemilih terpisah = dua jawaban untuk "versi mana" atas data
   yang sama (L88).
3. Daftar versi dibaca dari `GET /api/kinerja/ssk/versi-list`. Tab Realisasi sudah
   punya pemuatnya (efek di `RealisasiTab.tsx`). Pemuat itu dipindah jadi satu hook
   `useDaftarVersiSsk(tahun, sumber)`, dipakai Realisasi **dan** Cetak, supaya
   tidak lahir salinan kedua.
4. Ganti sumber tetap mengembalikan versi ke yang terbaru (`ensureLatestVersi`,
   perilaku sekarang).

### 1.3 Versi WAJIB ikut tercetak

Celah yang ketemu saat memeriksa: kop unduhan detail (`kopDetail` di
`_exports.ts`) berbunyi "LAPORAN REALISASI KINERJA GAJI / BULAN JANUARI TAHUN
2026", dan nama berkasnya `Realisasi-GAJI-2026.xlsx`. Unduhan MURNI dan
PERUBAHAN-1 pagunya beda, tapi kop & nama berkasnya **identik**. Begitu versinya
bisa dipilih dari Cetak, ini berubah dari kurang informatif jadi menyesatkan
(pelajaran yang sama dengan kop Rekap).

- **Kop**: versi ditempel di baris ke-4 — "BULAN JANUARI TAHUN 2026 · SSK MURNI".
  Ditempel, bukan baris kelima: jumlah baris kop tetap 4, jadi letak kepala tabel
  di Excel & PDF tidak bergeser. Berlaku di layar, Excel, PDF.
- **Nama berkas**: diberi sisipan versi **hanya bila bukan versi terbaru** —
  `Realisasi-GAJI-MURNI-2026.xlsx`. Nama unduhan versi terbaru tidak berubah
  (aturan yang sama dengan `namaBerkasRekap`: hanya pilihan non-bawaan yang
  ditandai).
- **Semua pemanggil `kopDetail` ikut** (L69): Cetak detail, unduhan tab Realisasi
  (`RealisasiTab.tsx` memakai `exportRealisasiExcel` yang sama), dan bagian detail
  di unduhan bundel Rekap — yang terakhir mengambil versinya dari `versiRekap`
  per sumber, bukan dari `sskVersi`.

### 1.4 Rekening yatim di Cetak detail

Realisasi tidak berversi; yang beda antarversi hanya pagu & target. Saat MURNI
dipilih, rekening yang lahir di Perubahan **tidak punya pagu** di MURNI — barisnya
datang dari server dengan `yatim: true`.

Sekarang `hitungJumlahBulan` (`lib/kinerja/cetak-detail.ts`, dipakai layar, Excel,
PDF) menjumlah realisasi baris yatim tetapi pagunya 0, sehingga persen di baris
JUMLAH ikut naik tanpa penyebut. Rekap sudah lama tidak begitu: yatim dikeluarkan
dari hitungan lalu disebut di catatan.

- Baris yatim **tetap tampil** (uangnya nyata), ditandai "tidak ada di SSK MURNI".
- Baris yatim **keluar dari JUMLAH** — `hitungJumlahBulan` melewatinya dan
  memulangkan ringkasannya (jumlah rekening + rupiah).
- Catatan di bawah tabel **ikut tercetak** (layar, Excel, PDF): "N rekening tidak
  ada di SSK MURNI (realisasi Rp X) — tidak ikut dijumlah."

Data produksi versi berlaku bersih dari yatim (catatan Tahap 5), jadi cetakan
versi terbaru praktis tidak berubah angka.

### 1.5 Sengaja tidak

- Pemilih Rekap tetap dua keadaan (Berlaku/Murni) — Rekap menjumlah semua sumber.
- Laporan/KPI/Beranda tetap tanpa pemilih (L88 utuh: pertanyaannya "sekarang").

---

## 2. Buat Perubahan dari RKO murni yang kosong

### 2.1 Kenapa ditolak

Versi RKO tidak punya catatan sendiri: sebuah versi "ada" hanya kalau punya baris
di `kinerja_ssk` (`versi-list` = `GROUP BY versi_tipe, versi_seq`). "Buat
Perubahan" (`app/api/kinerja/ssk/perubahan/route.ts`) = salin baris versi asal +
kunci versi asal (`locked_at`). OBAT 2026 tidak dianggarkan di murni → MURNI 0
baris → tidak ada yang disalin maupun dikunci → `KinerjaVersiSumberKosongError`
(404).

Penjagaan itu dibuat untuk dua kasus yang memang salah: pilihan versi di layar
basi, atau MURNI sudah dihapus lewat Reset sementara Perubahan-nya hidup. Kasus
"sumber ini memang tidak dianggarkan di murni" tidak terpikirkan. Kalimatnya
juga bahasa mesin.

### 2.2 Aturan baru (sempit)

Diizinkan bila **versi asal MURNI DAN sumber itu belum punya satu baris RKO pun di
tahun itu** (semua versi kosong). Diperiksa di dalam transaksi, sesudah
`kunciVersiSsk` (L84):

- nomor = PERUBAHAN-1 (`MAX(versi_seq)` = 0 + 1), **tanpa salinan, tanpa kunci**
  (memang tidak ada baris untuk dikunci);
- balasan membawa `copied: 0` (kolom yang sudah ada di balasan route);
- audit `KINERJA_VERSI_CREATED`: "Buat PERUBAHAN-1 OBAT 2026 tanpa salinan: RKO
  murni kosong (tidak dianggarkan di murni)".

Logikanya dipindah dari route ke `buatVersiPerubahan()` di `lib/data/kinerja.ts`
supaya bisa diuji di MySQL kotak pasir; route tinggal menerjemahkan galat.

### 2.3 Yang tetap ditolak — kalimatnya diganti

Versi asal kosong padahal sumber itu **sudah** punya versi lain (pilihan basi /
MURNI dihapus) tetap 404, dengan kalimat manusia:

> "RKO OBAT MURNI kosong, padahal OBAT sudah punya versi lain. Pilih versi
> terbarunya dulu, baru Buat Perubahan."

### 2.4 Pagar Simpan ke MURNI sesudah ada Perubahan

MURNI kosong tidak punya baris untuk dikunci, jadi sesudah PERUBAHAN-1 tersimpan,
MURNI masih bisa diisi lewat API (di layar ia tidak muncul di daftar versi, tapi
pagar ada di API — L82). `saveSskBatch` menolak Simpan ke versi MURNI bila sumber
itu sudah punya baris PERUBAHAN di tahun itu → `KinerjaVersiTerkunciError`
(409, ditangani layar seperti versi terkunci biasa).

- Dibaca di bawah `kunciVersiSsk` yang diambil sebagai perintah **pertama**
  `saveSskBatch`. Urutannya `kunciVersiSsk → blud_locks → baris`, seragam dengan
  route Perubahan (`kunciVersiSsk → baris`), jadi tanpa lingkaran tunggu. Yang
  ditutup: Simpan MURNI berbarengan dengan Simpan pertama PERUBAHAN-1.
- Ikut menutup lubang lama: MURNI yang dihapus lewat Reset lalu "dipulihkan" dari
  Riwayat Simpan sementara Perubahan-nya hidup — sekarang lahir lagi tanpa
  `locked_at` dan bisa disunting. Konsekuensinya: pemulihan MURNI semacam itu
  ditolak. Itu memang benar — Perubahan-nya sudah disalin dari MURNI lama.

### 2.5 Layar

- Sesudah berhasil dengan `disalin: 0`, toast: "PERUBAHAN-1 disiapkan. RKO murni
  OBAT kosong, jadi tidak ada yang disalin. Isi lewat Inject Rekening atau Import,
  lalu Simpan — versi ini baru tercatat sesudah disimpan."
- Kalimat terakhir wajib: sebelum Simpan pertama tidak ada baris, jadi memuat
  ulang halaman mengembalikan layar ke MURNI. Tanpa kalimat itu orang mengira
  Perubahan-nya hilang.
- Dialog konfirmasi Buat Perubahan saat RKO kosong tidak berbunyi "MURNI akan
  dikunci" (tidak ada yang dikunci).

### 2.6 Rekap "Versi Murni"

Kop sudah netral ("OBAT tidak punya versi murni", `ringkasVersiRekap`). Yang salah
alamat hanya keadaan-kosong di `CetakTab.tsx` (semua sumber tanpa murni):
"MURNI-nya sudah dihapus di Pengaturan → Reset" → diganti "tidak punya RKO murni
— tidak dianggarkan di murni, atau versinya dihapus di Pengaturan → Reset".
Komentar di `lib/kinerja/muat-rekap.ts` ikut. Realisasi OBAT tidak ikut Rekap
murni — benar, murni tidak menganggarkannya.

### 2.7 Jalan sementara yang TIDAK disarankan

Inject Rekening ke MURNI berpagu 0 → Simpan → Buat Perubahan memang jalan hari
ini, tapi MURNI jadi berisi rekening berpagu 0, dan di Rekap murni realisasi OBAT
dihitung terhadap pagu 0 (persen serapan naik tanpa penyebut) — menyimpang dari
aturan yatim.

---

## 3. Dropdown Renaksi terpotong

### 3.1 Sebab

Kartu indikator di `rencana-aksi/_components/MainDashboard.tsx` ber-`overflow-hidden`
(untuk memotong bilah gradien atas mengikuti sudut bundar). Menu `SoftSelect`
`position: absolute`, `max-height: 280px` dengan gulir sendiri. Pemilih Indikator
ada di baris terbawah kartu, jadi menunya keluar dari kartu dan **terpotong** di
tepi bawahnya. Daftar 5–7 indikator lebih pendek dari 280px, sehingga menu tidak
punya gulir sendiri — butir di bawah tepi kartu tidak bisa dicapai sama sekali.
Kena di semua level (Tujuan sampai Sub Kegiatan), paling terasa saat daftarnya
panjang.

### 3.2 Perbaikan

`overflow-hidden` dibuang dari kartu itu; bilah gradien diberi `rounded-t-2xl`
supaya sudutnya tetap rapi. Menu lalu menimpa kartu di bawahnya (z-index 60) dan
halaman bisa digulir seperti biasa.

### 3.3 Ditolak: portal di `SoftSelect`

Memindah menu ke portal + `position: fixed` (pola `TipLayang`) memperbaiki semua
tempat sekaligus, tapi mengubah posisi & klik-luar di 16 pemakai/6 berkas untuk
satu kartu yang salah. Saat eksekusi, 15 pemakai lain diperiksa di peramban;
kalau ada yang terpotong juga, baru dipertimbangkan.

---

## 4. Uji & verifikasi

- `npx tsx scripts/test-kinerja-versi-cetak.mts` (baru): kop & nama berkas per versi
  (terbaru tanpa sisipan), semua pemanggil `kopDetail` mengoper versi, JUMLAH
  melewati yatim + ringkasannya, pemilih versi Cetak memakai `pilihVersi` shell.
  Bagian DB (kotak pasir 2099, `--env-file=.env.local`): Perubahan dari RKO kosong
  → PERUBAHAN-1 tanpa baris; dari MURNI kosong saat versi lain ada → 404; Simpan
  MURNI sesudah PERUBAHAN ada → ditolak; Simpan PERUBAHAN-1 pertama → tercatat.
- Uji mutasi untuk pagar-pagar di atas.
- Suite lama yang menyentuh berkas sama: `test-kinerja-rekap.mts`,
  `test-kinerja-simpan-realisasi.mts` (+ `-db.mjs`), `test-kinerja-riwayat-simpan.mts`.
- Peramban (2099): pilih MURNI di Cetak → tabel, kop, Excel/PDF (nama berkas),
  catatan yatim; Buat Perubahan di sumber kosong → isi → Simpan → daftar versi;
  dropdown Renaksi menggulir sampai butir terakhir; tema terang & 375 px.
- 2026 hanya dibaca.

## 5. Urutan kerja

1. Renaksi (§3) — terpisah, paling kecil.
2. Perubahan dari RKO kosong (§2) — server dulu, lalu layar.
3. Pemilih versi Cetak + versi tercetak + yatim (§1).
