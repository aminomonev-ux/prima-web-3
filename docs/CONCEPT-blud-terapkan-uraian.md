# CONCEPT — Tombol Terapkan pada uraian pergeseran

> Status: **konsep** (2026-09-01), belum dikerjakan.
> Lanjutan dari [CONCEPT-blud-uraian-geser.md](CONCEPT-blud-uraian-geser.md).
> Nol kolom, nol migrasi, nol endpoint.

---

## 1. Yang diminta

Sekarang urutannya masih dua langkah: geser angkanya di Vol P atau Harga P,
baru diuraikan di kolom Bertambah dan Berkurang.

Yang ditambahkan: satu tombol **Terapkan** supaya langkah pertama bisa
dikerjakan sendiri oleh sistem, dan satu keterangan singkat bila tombol itu
tidak ditekan.

## 2. Bentuknya

Satu baris di bawah kotak isian, pada baris yang bersangkutan:

```
Belum masuk ke pagu. Harga P jadi Rp 4.407.407 — meleset Rp 44.   [Terapkan]
Atau ubah sendiri Vol P / Harga P agar pas.                        (Batal)
```

Pada baris bervolume satu, angkanya selalu pas:

```
Belum masuk ke pagu. Harga P jadi Rp 150.000 — pas.               [Terapkan]
Atau ubah sendiri Vol P / Harga P agar pas.                        (Batal)
```

Baris kedua itu penting justru karena tombolnya **hanya menawarkan satu jalan**
(lewat Harga P, §3). Banyak keadaan yang jalan keluarnya bukan itu — memangkas
volume, atau mengubah nominal geserannya. Tanpa kalimat itu, orang mengira
tombol tersebut satu-satunya cara.

**Batal** menutup tawarannya saja. Ia tidak menghapus angka yang sudah diketik
dan tidak menghilangkan tanda merah — memang belum beres, dan menyembunyikannya
akan berbohong.

## 2.1 Uraian yang belum pas memang menahan Simpan

Perlu ditegaskan karena mudah disalahpahami: uraian yang tidak cocok dengan
selisihnya **bukan sekadar catatan yang boleh dibiarkan**. Pemeriksaan
`bertambah − berkurang = pergeseran − jumlah` sudah terpasang dan menolak
penyimpanan (`URAIAN_GESER_TIDAK_COCOK`).

Jadi tawaran ini bukan kemudahan tambahan, melainkan jalan pintas untuk sesuatu
yang memang harus diselesaikan. Dua jalan keluarnya persis yang tertulis di
layar: tekan Terapkan, atau sesuaikan sendiri Vol P / Harga P.

## 3. Yang diubah tombol itu: Harga P, bukan Vol P

`Harga P = pagu tujuan ÷ Vol P`, dibulatkan ke rupiah utuh. Volume tidak
disentuh.

Alasannya: volume itu jumlah barang atau orang yang nyata — 108 dokter, 60 kursi.
Mengubahnya berarti mengubah rencana, bukan menyesuaikan angka. Menurunkan pagu
Dokter Umum sebesar Rp 10.000.000 lewat volume berarti memangkas 2 dokter, dan
nominal geserannya ikut berubah jadi Rp 9.000.000 — keputusan yang tidak boleh
diambil sebuah tombol.

Harga satuan lebih aman disesuaikan, dan selisih pembulatannya kecil serta
**selalu disebutkan** ("meleset Rp 44"). Menyembunyikannya membuat orang
mengira angkanya persis.

Bila Vol P kosong atau nol, tombolnya tidak muncul — tidak ada yang bisa
dibagi.

## 4. Sesudah ditekan

Pagu berubah, sehingga selisihnya ikut berubah. Karena pembulatan, `bertambah −
berkurang` bisa meleset beberapa rupiah dari `pergeseran − jumlah`, dan
pemeriksaan yang sudah terpasang akan menolaknya saat menyimpan.

Karena itu angka uraian **ikut disesuaikan** ke nilai yang benar-benar terjadi
(pada contoh di atas: Rp 9.999.956, bukan Rp 10.000.000). Kalau tidak, tombol
itu sendiri yang membuat barisnya ditolak.

## 5. Yang sengaja tidak dikerjakan

- Menerapkan otomatis tanpa ditekan — angka uang tidak berubah tanpa diminta
- Menawarkan pilihan cara (harga atau volume) sebagai dua tombol: tawaran
  bercabang panjang tidak dibaca orang. Jalan lewat volume tetap disebut, tapi
  sebagai kalimat — dikerjakan sendiri oleh penggunanya
- Mengubah Vol P — §3
- Membuat Batal menghapus angka yang sudah diketik, atau menyembunyikan tanda
  merah — keduanya menutupi keadaan yang belum beres

## 6. Definition of Done

- [ ] Keterangan muncul hanya bila `bertambah − berkurang` belum sama dengan
      `pergeseran − jumlah`, dan hilang begitu cocok
- [ ] Selisih pembulatan disebutkan; bila pas, ditulis "pas"
- [ ] Tombol tidak muncul saat Vol P kosong atau nol
- [ ] Tombol tidak muncul di baris induk — tidak punya Vol P sendiri
- [ ] Sesudah ditekan, angka uraian ikut disesuaikan sehingga barisnya lolos
      pemeriksaan saat menyimpan
- [ ] Tanpa menekan tombol, tidak ada satu angka pun yang berubah
- [ ] Kalimat "atau ubah sendiri Vol P / Harga P agar pas" selalu menyertai
      tombolnya
- [ ] Batal hanya menutup tawaran — angka yang diketik dan tanda merahnya tetap
- [ ] Warnanya bertahan di tema terang (kelas, bukan gaya sebaris — L82)
- [ ] Regresi: mutasi yang wajib tertangkap — (a) diterapkan tanpa ditekan,
      (b) selisih pembulatan tidak disebutkan, (c) angka uraian tidak
      disesuaikan sehingga barisnya ditolak saat menyimpan, (d) muncul di baris
      induk, (e) pembagian nol tidak dijaga
