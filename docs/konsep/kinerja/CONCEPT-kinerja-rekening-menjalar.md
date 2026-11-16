# Suntingan Rekening menjalar ke RKO & Realisasi (E-Anggaran)

2026-11-03. Pasangan dari `CONCEPT-kinerja-master-menjalar.md`: urutan pengisian E-Anggaran
Master → Rekening → RKO → Realisasi, dan tiap langkah menyimpan SALINAN teks langkah
sebelumnya. Master sudah menjalar sejak 2026-11-02; Rekening belum.

## 1. Masalah

Mengubah Program/Kegiatan/Sub/Uraian SSK/Rekening Belanja satu rekening di tab Rekening
hanya mengubah baris `kinerja_rekening`. Baris RKO-nya (disalin saat Inject) dan Realisasi-nya
tetap di rantai lama, jadi Cetak Rekap memecahnya jadi dua kelompok. Kasus nyata: rekening BLUD
dipindah ke program berbintang, RKO tetap tanpa bintang.

## 2. Aturan (`lib/kinerja/rekening-menjalar.ts`, PURE)

- **Pasangan lama ↔ baru lewat `id`** baris yang dimuat layar. Simpan Rekening itu hapus-tulis-
  ulang, jadi id berganti tiap Simpan — balasan PUT membawa baris ber-id baru dan layar
  memasangnya. Baris tanpa id (baru, Impor, Pulihkan) tidak menjalarkan apa pun.
- **Tautan Rekening ↔ RKO = `uraian_ssk||uraian` per sumber**, kunci yang sama dipakai Inject
  untuk "sudah ada". Di tiap versi RKO, baris berkunci lama yang rantainya cocok (tiap tingkat
  kosong atau sama — aturan `cocokInduk`) yang ikut. Bila tak ada yang cocok, satu-satunya baris
  berkunci itu tetap ikut (RKO yang tertinggal sebelum fitur ini ada) asal tak ada rekening lain
  yang memakai kunci itu; dua baris atau lebih = ragu, dilewati.
- **RKO semua versi, termasuk yang terkunci** (keputusan pemilik yang sama dengan Master: hanya
  label). Yang ditulis = isi rekening baru apa adanya (5 kolom), kosong bukan NULL seperti Inject.
- **Realisasi** ikut lewat `ssk_canonical_id` baris RKO yang dipasangkan (juga bila RKO-nya sudah
  sama); baris lama tanpa canonical lewat `keterangan + uraian_ssk` + rantai. `keterangan` =
  Rekening Belanja baru.
- **Dilewati, disebut di dialog**: rekening kembar yang masih tinggal di rantai lama (RKO-nya
  milik rekening itu), rekening kembar yang diubah ke dua tujuan berbeda, RKO ragu.
- **Kembar RKO** (nama baru sudah dipakai baris lain di versi yang sama) tidak digabung — angka
  tak boleh dijumlahkan diam-diam — hanya disebut.
- Spasi di ujung dan Sumber Anggaran tidak dianggap perubahan nama.

## 3. Penulisan (`saveRekeningBatch`)

1. `kunciVersiSsk` + gembok Realisasi sumber itu sebagai perintah PERTAMA (L84) — urutan sama
   dengan Simpan RKO dan Master menjalar, jadi tanpa lingkaran tunggu.
2. Rekening lama `FOR UPDATE`, pagar penurunan drastis, RKO & Realisasi sumber itu dibaca.
3. Ada yang menjalar/dilewati dan belum dikonfirmasi → `KinerjaPerluJalarError` → 409
   `PERLU_KONFIRMASI_JALAR` membawa ringkasan. Tak ada yang tertulis.
4. Hapus-tulis-ulang rekening + foto Riwayat Simpan, lalu UPDATE RKO/Realisasi per kelompok
   nilai dengan `updated_at = updated_at`; angka kunci RKO per versi & Realisasi dinaikkan (tab
   terbuka kena 409 lalu menggabungkan ketikannya, tidak menulis balik nama lama).

Layar: dialog menyebut rekening yang berubah (kolom lama → baru), jumlah baris RKO per versi dan
Realisasi, yang dilewati beserta sebabnya; "Simpan & ikut ubah" mengirim `jalarkan: true`.
Audit `KINERJA_SAVE_REKENING` mendapat ekor jalarannya.

## 4. Batas

- Rekening tetap tanpa angka kunci optimistik: tab Rekening yang terbuka di dua tempat masih
  saling menimpa. Id yang sudah tak ada (disimpan orang lain) tidak dipasangkan → tidak menjalar
  (aman: tidak ada yang berpindah salah).
- Foto Riwayat Simpan Rekening dipulihkan tanpa id, jadi memulihkan tidak menjalar.

## 5. Ikut dibereskan: target bulanan Beranda

Grafik "Target vs Realisasi per Bulan" di Beranda E-Anggaran membaca RKO lewat
`GET /api/kinerja/ssk` tanpa versi = MURNI-0. OBAT yang tidak dianggarkan di murni (RKO-nya
hanya PERUBAHAN-1) tampil "Belum ada data", dan sumber yang sudah Perubahan menampilkan target
murni di samping realisasi yang diukur ke Perubahan (L88). Kini `LaporanSumber.target_bulan`
dihitung server dari versi acuan yang sama dengan `total_pagu` (`targetBulanan`, baris dinol-kan
tidak ikut) dan grafik memakainya — 8 permintaan RKO per buka Beranda hilang. Kartu pagu,
Laporan, dan KPI sudah benar sebelumnya (`pilihVersiAgregat`).

Regresi: `npx tsx --env-file=.env.local scripts/test-kinerja-rekening-menjalar.mts` (56; bagian D
MySQL kotak pasir 2098), 19 uji mutasi tertangkap.
