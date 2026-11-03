# Target Pendapatan Perubahan (E-Anggaran, tab Pendapatan & CRR)

2026-11-03. Mig `migration-kinerja-pendapatan-perubahan.sql` — **wajib dijalankan di server kantor
sebelum kodenya dipasang**.

## 1. Masalah

`kinerja_pendapatan_real` menyimpan 12 baris per tahun (satu per bulan): target, realisasi, capaian —
tanpa versi. Saat target pendapatan berubah di Perubahan anggaran, mengetik angka baru menimpa
target murni, jadi perbandingan "Target Murni vs Target Perubahan" hilang. CRR hanya memakai
realisasi, tidak terpengaruh.

## 2. Keputusan pemilik: opsi A (satu kali Perubahan per tahun)

Kolom `target_perubahan` per bulan (NULL = belum ada Perubahan). Bila kelak target bisa berubah
lebih dari sekali setahun, opsi B (tabel target berversi seperti RKO) — belum dikerjakan.

## 3. Aturan (`lib/kinerja/pendapatan-perubahan.ts`, PURE)

- Target berlaku = `target_perubahan ?? target`. Capaian dari target berlaku — dihitung **server**
  saat menyimpan (`capaianPendapatan`), dipakai juga layar, Beranda (grafik Pendapatan), dan Excel.
- **Buat Target Perubahan** menyalin target murni ke kolom Perubahan; **Batalkan** mengosongkannya.
  Keduanya berhenti di form — yang menulis tetap Simpan Pendapatan.
- **Murni final** sesudah Target Perubahan tersimpan: `alasanTolakUbahMurni` (bulan dipasangkan
  menurut urutan) → 409 `TARGET_MURNI_FINAL`, termasuk di simpanan yang sekaligus membatalkan
  Perubahan (batalkan dulu, simpan, baru ubah Murni). Layar membuat kolom Murni hanya-baca.
- **L87**: `target_perubahan` yang tidak dikirim (tab lama) = jangan sentuh — Perubahan lama
  dipertahankan, bukan ditulis NULL.
- **Sebarkan selisih** (bantuan): total Perubahan yang diinginkan − total sekarang dibagi rata ke
  bulan yang belum ada realisasinya; sisa pembulatan rupiah ke bulan terakhir; ditolak bila tak ada
  bulan kosong atau hasilnya negatif.
- Audit `KINERJA_SAVE_PENDAPATAN` mendapat ekor: Target Perubahan dibuat / diubah / dibatalkan.

Regresi: `npx tsx --env-file=.env.local scripts/test-kinerja-pendapatan-perubahan.mts` (35; bagian C
MySQL kotak pasir 2095), 14 uji mutasi tertangkap.
