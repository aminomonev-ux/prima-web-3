# Konsep — Tabel Data Entry Rencana Aksi yang lebih lega

Status: **DIKERJAKAN** (2026-11-16, pilihan B). Nol tabel, kolom, migrasi, endpoint. Berlaku untuk
kelima menu Data Entry (Tujuan, Sasaran, Program, Kegiatan, Sub Kegiatan).

## 1. Masalah

Diukur di layar 1024 px pada Data Entry Sub Kegiatan 2026 (18 indikator):

| Hal | Dulu | Akibat |
|---|---|---|
| Lebar area tabel | 655 px (form memakan sepertiga kiri) | tabel 1.871 px harus digeser; nama tak terlihat bersama angka TW |
| Tinggi area tabel | dipatok ± 293 px | hanya satu baris yang muat |
| Tinggi satu baris | 267 px | nama Program, Kegiatan, Sub Kegiatan diulang tiap baris |
| Cari / saring | tidak ada | mencari satu indikator = menggulir |

## 2. Keputusan pemilik

1. **Pilihan B** (perombakan), bukan perbaikan cepat.
2. **Excel & PDF selalu semua baris** level itu, bukan hasil saringan. Tombolnya menyebut jumlahnya
   ("Excel (18)") supaya tidak ada dokumen yang diam-diam kurang.
3. **Tampilan bawaan Lengkap** (semua kolom). Ringkas tersedia sebagai pilihan.

## 3. Yang dibangun

- **Form di panel samping** (`DataEntryForm.tsx`): muncul dari "Tambah Data" atau ✎, isinya form yang
  sama persis termasuk Target Bulanan (dulu kartu terpisah di bawah tabel) dan editor pagu per sumber.
  Jalur simpan tetap satu (L78). Menutup panel (✕, Batal, klik latar) dengan isian yang berbeda dari
  saat dibuka ditanya dulu ("Buang isian"); pembandingnya potret seluruh state form, diambil ulang
  tiap baris dibuka. Simpan berhasil, hapus baris yang sedang dibuka, dan ganti level menutup panel.
- **Tabel selebar halaman** (`DataEntryTabel.tsx`), tinggi = sisa layar, kepala menempel; tampilan
  Lengkap menempelkan kolom No + nama entitas di kiri dan Aksi di kanan saat digeser.
- **Cari & saring** — aturan MURNI `lib/renaksi/tabel-data-entry.ts`:
  - Cari: setiap kata harus ada di salah satu kolom (nama tiap tingkat, indikator, kode, sasaran,
    outcome); huruf besar-kecil dan penanda matriks (bintang, `(1)`) diabaikan lewat `nama-resmi.ts`.
  - Saring induk: Tujuan / Sasaran / Program, dan Kegiatan (mengikuti Program) di Sub Kegiatan.
  - Chip berjumlah: Pagu belum diisi (sub kegiatan), Target belum diisi, Belum tertaut indikator
    induk (bukan tujuan). Beberapa chip = semuanya berlaku. Angka chip = hasil bila chip itu ditekan.
  - "Menampilkan X dari Y".
- **Kelompok per induk** (Sub Kegiatan: Program › Kegiatan; Kegiatan: Program; Program: Sasaran;
  Sasaran: Tujuan), bisa dilipat satu-satu atau semua. Kolom induk tidak diulang di baris. Nomor urut
  bersambung antarkelompok.
- **Ringkas**: No · Nama/Indikator · Target tahunan + satuan · Pagu · TW I–IV (target / realisasi) · Aksi.
- **Ponsel** (< 640 px): kartu per indikator, panel selebar layar.
- Pilihan Lengkap/Ringkas diingat per peramban (`localStorage`, try/catch). Teks cari dan chip
  sengaja **tidak** diingat — membuka menu dengan saringan tersembunyi membuat baris tampak hilang.

## 4. Yang tidak berubah

Isi form, aturan simpan, Kunci Periode, kunci tahun Renaksi, pagar pagu RKO, Impor, isi Excel/PDF,
penanda matriks di layar kerja (`usePenanda()`).

## 5. Uji

- `npx tsx scripts/test-renaksi-tabel-data-entry.mts` (29) — cari, chip, induk, kelompok, unduhan
  semua baris, bawaan Lengkap, tanya sebelum membuang isian. 8 uji mutasi tertangkap.
- `test-renaksi-desimal` & `test-renaksi-penanda` kini juga membaca `DataEntryTabel.tsx`.
- Di layar (akun dummy): 2026 Sub Kegiatan dibaca saja (cari, Ringkas, panel, tanya-buang); Tambah,
  Ubah, kelompok, hapus diuji di 2044 lalu dibersihkan; tema gelap & terang; 375 px tanpa geser
  mendatar.
